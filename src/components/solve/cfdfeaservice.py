import os
import zipfile
import tempfile
import logging
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

CFDFEASERVICE_BASE = os.getenv('CFDFEASERVICE_BASE_URL', 'https://cloud.cfdfeaservice.it/api/v1')

# Numeric status codes returned by GET /api/v1/simulation/{id}
STATUS_PENDING = 20
STATUS_RUNNING = 30
STATUS_COMPLETED = 10
STATUS_ERROR = 60


def _headers(api_key: str) -> dict:
    return {
        'Authorization': f'Bearer {api_key}',
        'Accept': 'application/json',
    }


def upload_case(sim_path: str, api_key: str) -> str:
    """
    Compress the simulation directory to a zip and upload it to CFD FEA Service
    storage. Returns the remote folder name (used later to submit and download).

    Args:
        sim_path: Local path to the OpenFOAM simulation directory.
        api_key:  CFD FEA Service API key (CFDFEASERVICE_API_KEY).

    Returns:
        Remote folder name (str) assigned by the service.
    """
    logger.info(f"    * Compressing simulation directory: {sim_path}")

    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
        zip_path = tmp.name

    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            base = Path(sim_path)
            for file in base.rglob('*'):
                if file.is_file():
                    zf.write(file, file.relative_to(base.parent))

        zip_size_mb = Path(zip_path).stat().st_size / (1024 * 1024)
        logger.info(f"    * Zip created: {zip_path} ({zip_size_mb:.1f} MB)")

        logger.info(f"    * Uploading to CFD FEA Service storage...")
        with open(zip_path, 'rb') as f:
            response = requests.post(
                f"{CFDFEASERVICE_BASE}/storage/upload",
                headers=_headers(api_key),
                files={'file': ('case.zip', f, 'application/zip')},
                timeout=300,
            )
        response.raise_for_status()
        data = response.json()

        folder = data.get('folder') or data.get('name') or data.get('id')
        if not folder:
            raise ValueError(f"Unexpected upload response — no folder key: {data}")

        logger.info(f"    * Upload complete — remote folder: {folder}")
        return str(folder)

    finally:
        try:
            Path(zip_path).unlink()
        except Exception:
            pass


def submit_simulation(folder: str, api_key: str) -> str:
    """
    Submit a simulation via POST /api/v1/simulation.

    Env vars (all optional, service defaults apply if not set):
        CFDFEASERVICE_CPUS   — number of CPU cores (default: 8)
        CFDFEASERVICE_RAM_GB — RAM in GB (default: 16)
        CFDFEASERVICE_SCRIPT — shell script to run (default: ./Allrun)

    Args:
        folder:  Remote folder name returned by upload_case().
        api_key: CFD FEA Service API key.

    Returns:
        task_id (str) assigned by the service.
    """
    cpus = int(os.getenv('CFDFEASERVICE_CPUS', '8'))
    ram_gb = int(os.getenv('CFDFEASERVICE_RAM_GB', '16'))
    script = os.getenv('CFDFEASERVICE_SCRIPT', './Allrun')

    payload = {
        'folder': folder,
        'cpus': cpus,
        'ram': ram_gb,
        'script': script,
    }

    logger.info(f"    * Submitting simulation — folder={folder}, cpus={cpus}, ram={ram_gb}GB, script={script}")

    response = requests.post(
        f"{CFDFEASERVICE_BASE}/simulation",
        headers={**_headers(api_key), 'Content-Type': 'application/json'},
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()

    task_id = data.get('id') or data.get('taskId') or data.get('simulation_id')
    if not task_id:
        raise ValueError(f"Unexpected submission response — no id key: {data}")

    logger.info(f"    * Simulation submitted — task_id: {task_id}")
    return str(task_id)


def check_status(task_id: str, api_key: str) -> int:
    """
    Check the simulation status via GET /api/v1/simulation/{id}.

    Returns:
        Numeric status code:
            STATUS_PENDING    = 20
            STATUS_RUNNING    = 30
            STATUS_COMPLETED  = 10
            STATUS_ERROR      = 60

    Raises:
        requests.HTTPError on non-2xx responses.
        ValueError if status field is missing.
    """
    response = requests.get(
        f"{CFDFEASERVICE_BASE}/simulation/{task_id}",
        headers=_headers(api_key),
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()

    status = data.get('status') or data.get('state') or data.get('statusCode')
    if status is None:
        raise ValueError(f"Unexpected status response — no status key: {data}")

    return int(status)


def download_results(task_id: str, sim_path: str, api_key: str) -> bool:
    """
    List result files in the remote folder for task_id and download them to sim_path.

    Args:
        task_id:  Task ID returned by submit_simulation().
        sim_path: Local directory where results will be saved.
        api_key:  CFD FEA Service API key.

    Returns:
        True on success, False on failure.
    """
    logger.info(f"    * Listing result files for task {task_id}...")

    try:
        response = requests.get(
            f"{CFDFEASERVICE_BASE}/simulation/{task_id}/files",
            headers=_headers(api_key),
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        files = data if isinstance(data, list) else data.get('files', [])
        logger.info(f"    * Found {len(files)} result file(s)")

        Path(sim_path).mkdir(parents=True, exist_ok=True)

        for file_entry in files:
            file_name = file_entry.get('name') or file_entry.get('filename')
            file_url = file_entry.get('url') or file_entry.get('downloadUrl')

            if not file_name or not file_url:
                logger.warning(f"    * Skipping entry with missing name/url: {file_entry}")
                continue

            dest = Path(sim_path) / file_name
            dest.parent.mkdir(parents=True, exist_ok=True)

            logger.info(f"    * Downloading {file_name}...")
            dl_response = requests.get(file_url, headers=_headers(api_key), timeout=300, stream=True)
            dl_response.raise_for_status()

            with open(dest, 'wb') as f:
                for chunk in dl_response.iter_content(chunk_size=8192):
                    f.write(chunk)

        logger.info(f"    * All results downloaded to {sim_path}")
        return True

    except Exception as e:
        logger.error(f"    * Failed to download results for task {task_id}: {e}")
        return False
