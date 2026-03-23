import os
import sys
import time
import json
import signal
import logging
import traceback
from datetime import datetime
from typing import Dict, Any, Optional
import requests

# ---------------------------------------------------------------------------
# sys.path setup: must be done BEFORE importing PYTHON_STEPS modules so that
#   - src.components.* resolves from the project root
#   - pipeline_exceptions resolves from PYTHON_STEPS/
# ---------------------------------------------------------------------------
_PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
_PYTHON_STEPS_DIR = os.path.join(_PROJECT_ROOT, 'PYTHON_STEPS')

for _p in [_PROJECT_ROOT, _PYTHON_STEPS_DIR]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Import step runners directly (PYTHON_STEPS/ is in sys.path)
from step01_json2geo import run as step01_run
from step02_geo2mesh import run as step02_run
from step03_mesh2cfd import run as step03_run
from step04_cfd2result import run as step04_run
from step05_results2post import run as step05_run
from mesher_config import get_default_mesher
from pipeline_exceptions import (
    PipelineStepError,
    GeometryStepError,
    MeshingStepError,
    CFDSetupError,
    SubmissionError
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_BASE = os.getenv('API_BASE_URL', 'http://localhost:5000')
API_KEY = 'flowerpower-external-api'
POLLING_INTERVAL = 10

# Solver type: "local" runs step04 blocking locally;
#              "cloud" submits async and worker_monitor handles step05
SOLVER_TYPE = os.getenv('SOLVER_TYPE', 'cloud')

# Number of CPUs to request on the cloud solver and use for domain decomposition.
# Must match numberOfSubdomains in decomposeParDict and -np in Allrun.
N_CPU = 2

def _parse_stop_after() -> "int | None":
    """
    Read and parse PIPELINE_STOP_AFTER env var fresh on each call.
    Returns an int (1-4) when debug mode is active, None otherwise.
    Re-read per simulation so the value can be changed without restarting
    the worker process.
    """
    raw = os.getenv('PIPELINE_STOP_AFTER', '').strip()
    if raw.isdigit():
        value = int(raw)
        if 1 <= value <= 5:
            return value
        logger.warning(f"PIPELINE_STOP_AFTER={raw} is out of valid range (1-5), ignoring")
    return None

logging.basicConfig(
    level=logging.INFO,
    format='[WORKER_SUBMIT] [%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-flight simulation tracking (used by the SIGTERM handler)
# ---------------------------------------------------------------------------
# Set to the simulation ID and current step name while process_simulation() is
# running.  Cleared back to None when processing finishes.
_inflight_sim_id: Optional[int] = None
_inflight_step: str = 'unknown'


# ---------------------------------------------------------------------------
# Startup diagnostics
# ---------------------------------------------------------------------------
def log_startup_configuration():
    is_production = os.getenv('NODE_ENV') == 'production'
    env_label = "PRODUCTION" if is_production else "DEVELOPMENT"

    logger.info("=" * 60)
    logger.info("WORKER_SUBMIT STARTING")
    logger.info("Process manager: supervisord (supervisord.conf)")
    logger.info("Operate with: supervisorctl start/stop/restart worker_submit")
    logger.info("=" * 60)
    logger.info(f"Environment: {env_label}")
    logger.info(f"NODE_ENV: {os.getenv('NODE_ENV', 'not set')}")
    logger.info(f"API_BASE: {API_BASE}")
    logger.info(f"SOLVER_TYPE: {SOLVER_TYPE}")
    _sa = _parse_stop_after()
    if _sa is not None:
        logger.info(f"PIPELINE_STOP_AFTER: {_sa}  *** DEBUG MODE — pipeline will stop after step {_sa} ***")
    else:
        logger.info("PIPELINE_STOP_AFTER: not set (full pipeline)")
    logger.info(f"Cases Directory: {os.path.join(os.getcwd(), 'cases')}")
    logger.info(f"PYTHON_STEPS: {_PYTHON_STEPS_DIR}")

    try:
        default_mesher = get_default_mesher()
        logger.info(f"Default Mesher: {default_mesher}")
    except Exception:
        logger.info("Default Mesher: cfmesh (fallback)")

    # CFD FEA Service configuration
    if SOLVER_TYPE != 'local':
        cfd_api_key = os.getenv('CFDFEASERVICE_API_KEY')
        cfd_configured = bool(cfd_api_key)
        cfd_status = "CONFIGURED" if cfd_configured else "NOT CONFIGURED"
        logger.info(f"CFD FEA Service: {cfd_status}")
        if cfd_configured:
            key_preview = cfd_api_key[:8] + "..." if len(cfd_api_key) > 8 else "***"
            logger.info(f"CFD FEA Service Key: {key_preview}")
            logger.info(f"CFD FEA Service Host: {os.getenv('CFDFEASERVICE_HOST', 'https://cloud.cfdfeaservice.it')}")
        else:
            logger.warning("CFDFEASERVICE_API_KEY not set — cloud submissions will fail")
    else:
        logger.info("CFD FEA Service: not needed (SOLVER_TYPE=local)")

    if is_production:
        logger.info("-" * 60)
        logger.info("PRODUCTION MODE NOTES:")
        if SOLVER_TYPE == 'local':
            logger.info("  - Steps 1-5 run fully local (blocking)")
        else:
            logger.info("  - Steps 1-3 local, step 4 submits to CFD FEA Service")
            logger.info("  - Results monitored by worker_monitor")
        logger.info("-" * 60)

    logger.info("=" * 60)


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------
def get_pending_simulations():
    try:
        response = requests.get(
            f"{API_BASE}/api/external/simulations/pending",
            headers={'x-api-key': API_KEY}
        )
        if response.ok:
            data = response.json()
            if isinstance(data, dict) and 'simulations' in data:
                return data['simulations']
            return data if isinstance(data, list) else []
        logger.error(f"Request failed: {response.status_code}")
        return []
    except Exception as e:
        logger.error(f"Failed to fetch pending sims: {e}")
        return []


def update_simulation(sim_id: int, data: Dict[str, Any]) -> bool:
    """PATCH simulation status.  Returns True on success, False on all failures.

    Makes 1 initial attempt plus up to 3 retries (4 total), with exponential
    backoff of 1s → 3s → 9s between attempts.  Each attempt uses a 10-second
    connect+read timeout so a hung Express process never blocks the worker
    indefinitely.
    """
    target_status = data.get('status', '(no status)')
    last_exc: Optional[Exception] = None
    _BACKOFF = [1, 3, 9]   # seconds to wait before retry 1, 2, 3

    for attempt in range(1, 5):   # attempts 1-4 (1 initial + 3 retries)
        try:
            resp = requests.patch(
                f"{API_BASE}/api/external/simulations/{sim_id}/status",
                json=data,
                headers={'x-api-key': API_KEY},
                timeout=10,
            )
            if resp.ok:
                if attempt > 1:
                    logger.info(
                        f"update_simulation({sim_id}, status={target_status}) succeeded on attempt {attempt}"
                    )
                return True
            # HTTP error (4xx/5xx): log and retry
            logger.warning(
                f"update_simulation({sim_id}, status={target_status}) attempt {attempt}/4 "
                f"got HTTP {resp.status_code}: {resp.text[:300]}"
            )
            last_exc = None  # not an exception, but still a failure
        except Exception as exc:
            last_exc = exc
            logger.warning(
                f"update_simulation({sim_id}, status={target_status}) attempt {attempt}/4 "
                f"raised {type(exc).__name__}: {exc}"
            )

        if attempt < 4:
            wait = _BACKOFF[attempt - 1]   # 1s, 3s, 9s
            logger.info(f"Retrying update_simulation({sim_id}) in {wait}s...")
            time.sleep(wait)

    # All retries exhausted — log a prominent error so it's visible in Cloud Run
    logger.error(
        f"❌ update_simulation({sim_id}, status={target_status}) FAILED after 4 attempts. "
        f"Last error: {last_exc}. Simulation may be frozen in DB."
    )
    return False


def _get_current_sim_status(sim_id: int) -> str:
    """Read the simulation's current status from the API (best-effort, no retries).

    The endpoint returns { success: true, simulation: { status: ..., ... } }.
    """
    try:
        resp = requests.get(
            f"{API_BASE}/api/external/simulations/{sim_id}",
            headers={'x-api-key': API_KEY},
            timeout=5,
        )
        if resp.ok:
            data = resp.json()
            # Response shape: { success: true, simulation: { status: "...", ... } }
            sim = data.get('simulation') or {}
            return sim.get('status', 'unknown')
    except Exception:
        pass
    return 'unknown'


def update_simulation_failure(sim_id: int, step: str, error: Exception):
    """Mark a simulation as failed, with retry and emergency logging.

    If all PATCH retries fail, fetches the current DB status and logs a
    prominent ERROR so the incident is always visible in Cloud Run logs.
    """
    error_message = str(error)
    payload = {
        'status': 'failed',
        'errorMessage': error_message,
        'currentStep': f'Failed at {step}',
        'completedAt': datetime.utcnow().isoformat(),
        'failedStep': step,
        'errorType': type(error).__name__
    }
    if isinstance(error, PipelineStepError) and error.details:
        payload['failureDetails'] = error.details
        if 'suggestion' in error.details:
            payload['suggestion'] = error.details['suggestion']

    logger.error(
        f"[Sim {sim_id}] Pipeline failure at step '{step}': "
        f"[{type(error).__name__}] {error_message}"
    )

    ok = update_simulation(sim_id, payload)

    if ok:
        logger.info(
            f"[Sim {sim_id}] Successfully marked as failed in DB "
            f"(failedStep='{step}', errorType={type(error).__name__})"
        )
    else:
        # PATCH never landed — read DB state and emit a clear emergency log
        current_status = _get_current_sim_status(sim_id)
        logger.error(
            f"🚨 EMERGENCY: Sim {sim_id} could NOT be marked as failed in DB. "
            f"Current DB status: '{current_status}'. "
            f"Intended payload: status=failed, failedStep='{step}', "
            f"errorType={type(error).__name__}, errorMessage={error_message!r}. "
            f"ACTION REQUIRED: manually reset this simulation."
        )


# ---------------------------------------------------------------------------
# Pipeline execution
# ---------------------------------------------------------------------------
def _debug_stop(sim_id: int, step: int):
    """
    Mark simulation as completed in debug mode and signal the caller to stop.
    Called when PIPELINE_STOP_AFTER == step.
    """
    msg = f"Debug: stopped after step {step} (PIPELINE_STOP_AFTER={step})"
    logger.info(f"[Sim {sim_id}] {msg}")
    update_simulation(sim_id, {
        'status': 'completed',
        'progress': 100,
        'currentStep': msg,
        'completedAt': datetime.utcnow().isoformat()
    })


def process_simulation(sim: Dict[str, Any]):
    """
    Execute the 5-step CFD pipeline sequentially for a single simulation.

    Steps 1-3 always run locally.
    Step 4 behaviour depends on SOLVER_TYPE env var:
      - "local"  → runs the solver blocking in this process, then runs step 5
      - "cloud"  → submits to cloud asynchronously; worker_monitor handles step 5

    Debug mode: if PIPELINE_STOP_AFTER=N is set, the pipeline stops after step N
    and marks the simulation as completed with a debug message.
    """
    global _inflight_sim_id, _inflight_step

    sim_id = sim['id']
    case_name = f"sim_{sim_id}"
    simulation_type = sim.get('simulationType', 'SteadySim')

    # Parse jsonConfig if it came as a string
    json_config = sim.get('jsonConfig', {})
    if isinstance(json_config, str):
        json_config = json.loads(json_config)

    # Read debug stop limit fresh per simulation (allows changing without restart)
    stop_after = _parse_stop_after()
    if stop_after is not None:
        logger.info(f"[Sim {sim_id}] DEBUG MODE: PIPELINE_STOP_AFTER={stop_after} — will stop after step {stop_after}")

    logger.info(f"[Sim {sim_id}] Starting pipeline — case: {case_name}, type: {simulation_type}")

    # Track this simulation so the SIGTERM handler can mark it failed if needed
    _inflight_sim_id = sim_id
    _inflight_step = 'initializing'

    try:
        # Initialize
        update_simulation(sim_id, {
            'status': 'processing',
            'progress': 10,
            'currentStep': 'Initializing...',
            'startedAt': datetime.utcnow().isoformat()
        })

        # -----------------------------------------------------------------
        # Step 1: JSON → Geometry
        # -----------------------------------------------------------------
        _inflight_step = 'geometry'
        logger.info(f"[Sim {sim_id}] Step 1/5: Generating 3D geometry...")
        update_simulation(sim_id, {
            'status': 'geometry',
            'progress': 20,
            'currentStep': 'Generating 3D geometry...'
        })
        try:
            geo_mesh, geo_df = step01_run(json_config, case_name)
        except PipelineStepError:
            raise
        except Exception as e:
            raise GeometryStepError(
                f"Geometry generation failed: {e}",
                {'case_name': case_name, 'suggestion': 'Check if room polygon is closed and valid'}
            )
        logger.info(f"[Sim {sim_id}] Step 1 complete")
        if stop_after == 1:
            _debug_stop(sim_id, 1)
            return

        # -----------------------------------------------------------------
        # Step 2: Geometry → Mesh
        # -----------------------------------------------------------------
        _inflight_step = 'meshing'
        logger.info(f"[Sim {sim_id}] Step 2/5: Creating computational mesh...")
        update_simulation(sim_id, {
            'status': 'meshing',
            'progress': 40,
            'currentStep': 'Creating computational mesh...'
        })
        try:
            mesher_type = get_default_mesher()
            logger.info(f"[Sim {sim_id}] Using mesher: {mesher_type}")
            mesh_scripts = step02_run(case_name, geo_mesh, geo_df, type=mesher_type)
        except PipelineStepError:
            raise
        except Exception as e:
            raise MeshingStepError(
                f"Mesh generation failed: {e}",
                {'case_name': case_name, 'suggestion': 'Check if geometry is valid for meshing'}
            )
        logger.info(f"[Sim {sim_id}] Step 2 complete")
        if stop_after == 2:
            _debug_stop(sim_id, 2)
            return

        # -----------------------------------------------------------------
        # Step 3: Mesh → CFD setup
        # -----------------------------------------------------------------
        _inflight_step = 'cfd_setup'
        logger.info(f"[Sim {sim_id}] Step 3/5: Setting up CFD case...")
        update_simulation(sim_id, {
            'status': 'cfd_setup',
            'progress': 60,
            'currentStep': 'Setting up CFD case...'
        })
        try:
            step03_run(
                case_name,
                type="hvac",
                mesh_script=mesh_scripts,
                simulation_type=simulation_type,
                n_cpu=N_CPU
            )
        except PipelineStepError:
            raise
        except Exception as e:
            raise CFDSetupError(
                f"CFD setup failed: {e}",
                {'case_name': case_name, 'suggestion': 'Check boundary conditions and solver settings'}
            )
        logger.info(f"[Sim {sim_id}] Step 3 complete")
        if stop_after == 3:
            _debug_stop(sim_id, 3)
            return

        # -----------------------------------------------------------------
        # Step 4: CFD execution
        # -----------------------------------------------------------------
        _inflight_step = 'cloud_submission'
        if SOLVER_TYPE == 'local':
            # Run solver blocking and then post-process in this same worker
            logger.info(f"[Sim {sim_id}] Step 4/5: Running CFD locally (blocking)...")
            update_simulation(sim_id, {
                'status': 'cloud_execution',
                'progress': 70,
                'currentStep': 'Running CFD solver locally...'
            })
            try:
                step04_run(case_name, type="local", n_cpu=N_CPU)
            except Exception as e:
                raise SubmissionError(
                    f"CFD execution failed: {e}",
                    {'case_name': case_name}
                )
            logger.info(f"[Sim {sim_id}] Step 4 complete (local)")
            if stop_after == 4:
                _debug_stop(sim_id, 4)
                return

            # -----------------------------------------------------------------
            # Step 5: Post-processing (only when running locally)
            # -----------------------------------------------------------------
            _inflight_step = 'post_processing'
            logger.info(f"[Sim {sim_id}] Step 5/5: Post-processing results...")
            update_simulation(sim_id, {
                'status': 'post_processing',
                'progress': 85,
                'currentStep': 'Post-processing results...'
            })
            try:
                step05_run(case_name)
            except Exception as e:
                raise SubmissionError(
                    f"Post-processing failed: {e}",
                    {'case_name': case_name}
                )
            logger.info(f"[Sim {sim_id}] Step 5 complete")

            update_simulation(sim_id, {
                'status': 'completed',
                'progress': 100,
                'currentStep': 'Completed',
                'completedAt': datetime.utcnow().isoformat()
            })
            logger.info(f"[Sim {sim_id}] Pipeline completed successfully (local)")

        else:
            # Cloud mode: submit async, worker_monitor handles steps 5+
            # NOTE: do NOT call update_simulation with status='cloud_execution' here.
            # The state machine only allows each transition once. The single PATCH
            # below (after we have the task_id) makes the cfd_setup→cloud_execution
            # transition AND saves the taskId atomically.
            logger.info(f"[Sim {sim_id}] Step 4/5: Submitting to cloud...")
            update_simulation(sim_id, {
                'progress': 70,
                'currentStep': 'Submitting to cloud...'
            })
            try:
                # step04_run with type="cfdfeaservice" and wait=False uploads the
                # case, submits to CFD FEA Service, and returns the cloud task_id
                # immediately. worker_monitor polls status and handles step 5.
                task_id = step04_run(case_name, type="cfdfeaservice", wait=False, n_cpu=N_CPU)
            except Exception as e:
                raise SubmissionError(
                    f"Cloud submission failed: {e}",
                    {'case_name': case_name, 'suggestion': 'Check cloud solver configuration'}
                )

            logger.info(f"[Sim {sim_id}] Step 4 complete (cloud) — task_id: {task_id}")
            if stop_after == 4:
                _debug_stop(sim_id, 4)
                return

            # Single transition: cfd_setup → cloud_execution WITH taskId in same call
            update_simulation(sim_id, {
                'status': 'cloud_execution',
                'taskId': str(task_id) if task_id else None,
                'progress': 75,
                'currentStep': 'Running on cloud...'
            })
            logger.info(f"[Sim {sim_id}] Handed off to worker_monitor for post-processing")

    except PipelineStepError as e:
        logger.error(f"[Sim {sim_id}] Pipeline step error: {e}")
        update_simulation_failure(sim_id, getattr(e, 'step_name', _inflight_step), e)

    except Exception as e:
        logger.error(f"[Sim {sim_id}] Unexpected error: {e}")
        logger.error(traceback.format_exc())
        update_simulation_failure(sim_id, _inflight_step, e)

    finally:
        # Always clear inflight tracking once the simulation is done (success or failure)
        _inflight_sim_id = None
        _inflight_step = 'unknown'


# ---------------------------------------------------------------------------
# SIGTERM / SIGINT handler
# ---------------------------------------------------------------------------
def _handle_shutdown(signum, frame):
    """Graceful shutdown handler for SIGTERM (Cloud Run rolling deploy) and SIGINT.

    If a simulation is currently being processed, marks it as failed in the DB
    (with retries) so it doesn't stay frozen in an intermediate state.
    """
    sig_name = signal.Signals(signum).name
    logger.warning(f"[SHUTDOWN] Received {sig_name} — initiating graceful shutdown")

    if _inflight_sim_id is not None:
        logger.warning(
            f"[SHUTDOWN] Sim {_inflight_sim_id} was in-flight at step '{_inflight_step}'. "
            f"Marking as failed before exiting."
        )
        shutdown_error = RuntimeError(
            f"Worker received {sig_name} (container shutdown) while processing at step '{_inflight_step}'. "
            f"Simulation was interrupted by Cloud Run deployment or container restart."
        )
        update_simulation_failure(_inflight_sim_id, _inflight_step, shutdown_error)
    else:
        logger.info("[SHUTDOWN] No simulation in flight — clean shutdown.")

    logger.warning("[SHUTDOWN] Exiting worker_submit.")
    sys.exit(0)


# ---------------------------------------------------------------------------
# Main polling loop
# ---------------------------------------------------------------------------
def main():
    log_startup_configuration()

    # Register graceful shutdown handlers so SIGTERM (Cloud Run) marks any
    # in-flight simulation as failed instead of leaving it frozen.
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)
    logger.info("SIGTERM/SIGINT handlers registered — graceful shutdown enabled")

    while True:
        try:
            sims = get_pending_simulations()

            # Only process HVAC simulations
            sims = [s for s in sims if s.get('simulationType') in ['SteadySim', 'TransientSim']]
            logger.info(f"Found {len(sims)} HVAC simulations to process")

            for sim in sims:
                process_simulation(sim)

            time.sleep(POLLING_INTERVAL)

        except SystemExit:
            raise   # let _handle_shutdown's sys.exit(0) propagate
        except KeyboardInterrupt:
            logger.info("Worker stopped")
            break
        except Exception as e:
            logger.error(f"Worker error: {e}")
            time.sleep(POLLING_INTERVAL)


if __name__ == "__main__":
    main()
