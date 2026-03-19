"""
CFD FEA Service cloud solver integration.

API base: https://cloud.cfdfeaservice.it  (v2 endpoints)
Auth:     X-API-Key header

Upload flow:
  1. POST /api/v2/storage/upload-url  → presigned PUT URL
  2. PUT  <presigned_url>             → direct upload (no auth header)
  3. DELETE /api/v2/user/delete-cache → invalidate server cache

Submit flow:
  POST /api/v2/simulation/add  → simulation ID (int)

Status flow:
  GET /api/v2/simulation/view-short/{id}  → response.status (int)
    20 = pending
    30 = running
    40 = queued/preparing
    10 = completed
    60 = error

Download flow:
  GET  /api/v2/simulation/view-short/{id}    → response.folder (name)
  GET  /api/v2/storage/index/name/asc/1      → list root folders, find folder_id
  GET  /api/v2/storage/index/size/desc/parent_id/{folder_id}/1  → list files
  POST /api/v2/storage/view-by-path          → file_id
  GET  /api/v2/storage/view-url/{file_id}    → response.mediaLink (direct URL)
  download via GET <mediaLink>
"""

import os
import tarfile
import tempfile
import logging
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

CFDFEASERVICE_HOST = os.getenv('CFDFEASERVICE_HOST', 'https://cloud.cfdfeaservice.it')

# Numeric status codes (GET /api/v2/simulation/view-short/{id})
STATUS_COMPLETED = 10
STATUS_PENDING   = 20
STATUS_RUNNING   = 30
STATUS_QUEUED    = 40
STATUS_ERROR     = 60


def _headers(api_key: str) -> dict:
    """Standard request headers for CFD FEA Service API."""
    return {
        'X-API-Key': api_key,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }


def _url(path: str) -> str:
    return f"{CFDFEASERVICE_HOST}{path}"


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def upload_case(sim_path: str, api_key: str) -> str:
    """
    Compress sim_path to a .tar.gz and upload it to CFD FEA Service storage.

    Uses the presigned-URL upload flow:
      1. POST /api/v2/storage/upload-url → { response: { url: <presigned_put_url> } }
      2. PUT <presigned_url> with the tar.gz file
      3. DELETE /api/v2/user/delete-cache

    Args:
        sim_path: Local path to the OpenFOAM simulation directory.
        api_key:  CFDFEASERVICE_API_KEY value.

    Returns:
        folder_name (str) used to submit and later download results.
    """
    folder_name = Path(sim_path).name  # e.g. "sim" — use case_name instead
    # Use parent folder name (case_name like "sim_42") as the remote folder
    folder_name = Path(sim_path).parent.name

    logger.info(f"    * Compressing simulation directory: {sim_path}")

    with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as tmp:
        tar_path = tmp.name

    try:
        with tarfile.open(tar_path, 'w:gz') as tar:
            tar.add(sim_path, arcname=Path(sim_path).name)

        tar_size_mb = Path(tar_path).stat().st_size / (1024 * 1024)
        logger.info(f"    * Archive created: {tar_path} ({tar_size_mb:.1f} MB)")

        # Step 1: get presigned upload URL
        payload = {
            'dirname': folder_name,
            'filename': 'upload.tar.gz',
            'contentType': 'application/octet-stream',
        }
        logger.info(f"    * Requesting presigned upload URL for folder '{folder_name}'...")
        resp = requests.post(
            _url('/api/v2/storage/upload-url'),
            headers=_headers(api_key),
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        upload_url = data.get('response', {}).get('url')
        if not upload_url:
            raise ValueError(f"No presigned URL in upload-url response: {data}")

        # Step 2: PUT file directly to presigned URL (no auth header)
        logger.info(f"    * Uploading archive to cloud storage...")
        with open(tar_path, 'rb') as f:
            put_resp = requests.put(
                upload_url,
                data=f,
                headers={'Content-Type': 'application/octet-stream'},
                timeout=600,
            )
        put_resp.raise_for_status()

        # Step 3: invalidate server-side cache
        requests.delete(
            _url('/api/v2/user/delete-cache'),
            headers=_headers(api_key),
            timeout=30,
        )

        logger.info(f"    * Upload complete — remote folder: {folder_name}")
        return folder_name

    finally:
        try:
            Path(tar_path).unlink()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------

def submit_simulation(folder: str, api_key: str) -> str:
    """
    Submit a simulation via POST /api/v2/simulation/add.

    Env vars (all optional, service defaults apply if not set):
        CFDFEASERVICE_CPU    — number of vCPUs (default: 8)
        CFDFEASERVICE_RAM    — RAM label as expected by the service (default: standard)
        CFDFEASERVICE_SCRIPT — script name registered in the platform (default: openfoam2406esi_Allrun)

    Args:
        folder:  Remote folder name returned by upload_case().
        api_key: CFDFEASERVICE_API_KEY value.

    Returns:
        task_id (str) — the simulation ID returned by the service.
    """
    cpu    = os.getenv('CFDFEASERVICE_CPU', '8')
    ram    = os.getenv('CFDFEASERVICE_RAM', 'standard')
    script = os.getenv('CFDFEASERVICE_SCRIPT', 'openfoam2406esi_Allrun')

    payload = {
        'cpu':    cpu,
        'ram':    ram,
        'folder': folder,
        'script': script,
        'nopre':  '0',
        'mesh':   '',
    }

    logger.info(
        f"    * Submitting simulation — folder={folder}, cpu={cpu}, "
        f"ram={ram}, script={script}"
    )

    resp = requests.post(
        _url('/api/v2/simulation/add'),
        headers=_headers(api_key),
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()

    task_id = data.get('response')
    if task_id is None:
        raise ValueError(f"No simulation ID in add response: {data}")

    logger.info(f"    * Simulation submitted — task_id: {task_id}")
    return str(task_id)


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

def check_status(task_id: str, api_key: str) -> int:
    """
    Check simulation status via GET /api/v2/simulation/view-short/{id}.

    Returns:
        Numeric status code:
            STATUS_COMPLETED = 10
            STATUS_PENDING   = 20
            STATUS_RUNNING   = 30
            STATUS_QUEUED    = 40
            STATUS_ERROR     = 60

    Raises:
        requests.HTTPError on non-2xx responses.
        ValueError if status field is missing.
    """
    resp = requests.get(
        _url(f'/api/v2/simulation/view-short/{task_id}'),
        headers=_headers(api_key),
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    status = data.get('response', {}).get('status')
    if status is None:
        raise ValueError(f"No status field in view-short response: {data}")

    return int(status)


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_results(task_id: str, sim_path: str, api_key: str) -> bool:
    """
    Download simulation results from CFD FEA Service to sim_path.

    Flow:
      1. GET /api/v2/simulation/view-short/{id}    → response.folder
      2. GET /api/v2/storage/index/name/asc/1      → find folder_id
      3. GET /api/v2/storage/index/size/desc/parent_id/{folder_id}/1  → file list
      4. For each result file (tar.gz or result files):
           POST /api/v2/storage/view-by-path       → file_id
           GET  /api/v2/storage/view-url/{file_id} → response.mediaLink
           GET  <mediaLink>                         → download
      5. Extract tar.gz files in place

    Args:
        task_id:  Simulation ID returned by submit_simulation().
        sim_path: Local directory where results will be saved.
        api_key:  CFDFEASERVICE_API_KEY value.

    Returns:
        True on success, False on failure.
    """
    try:
        # Step 1: get folder name from simulation record
        logger.info(f"    * Getting simulation folder for task {task_id}...")
        resp = requests.get(
            _url(f'/api/v2/simulation/view-short/{task_id}'),
            headers=_headers(api_key),
            timeout=30,
        )
        resp.raise_for_status()
        folder_name = resp.json().get('response', {}).get('folder')
        if not folder_name:
            raise ValueError(f"No folder in view-short response: {resp.json()}")
        logger.info(f"    * Results folder: {folder_name}")

        # Step 2: list root storage folders to find folder_id
        resp = requests.get(
            _url('/api/v2/storage/index/name/asc/1'),
            headers=_headers(api_key),
            timeout=30,
        )
        resp.raise_for_status()
        folders = resp.json().get('response', [])
        folder_id = None
        for f in folders:
            if f.get('basename') == folder_name or f.get('name') == folder_name:
                folder_id = f.get('id')
                break
        if folder_id is None:
            raise ValueError(f"Folder '{folder_name}' not found in storage index")
        logger.info(f"    * Found folder_id: {folder_id}")

        # Step 3: list files in folder (order by size desc so largest files first)
        resp = requests.get(
            _url(f'/api/v2/storage/index/size/desc/parent_id/{folder_id}/1'),
            headers=_headers(api_key),
            timeout=30,
        )
        resp.raise_for_status()
        files = resp.json().get('response', [])
        # Filter result files: tar.gz archives or known result extensions
        result_files = [
            f for f in files
            if any(
                (f.get('name') or '').endswith(ext)
                for ext in ('.tar.gz', '.tgz', '.zip', '.rmed', '.frd')
            )
        ]
        if not result_files:
            # If no known result formats, download everything
            result_files = files

        logger.info(f"    * Found {len(result_files)} result file(s) to download")

        Path(sim_path).mkdir(parents=True, exist_ok=True)

        for file_entry in result_files:
            file_name = file_entry.get('name') or file_entry.get('basename', 'result')
            file_path_remote = file_entry.get('path') or f"{folder_name}/{file_name}"

            # Step 4a: resolve file ID via path
            resp = requests.post(
                _url('/api/v2/storage/view-by-path'),
                headers=_headers(api_key),
                json={'path': file_path_remote},
                timeout=30,
            )
            resp.raise_for_status()
            file_id = resp.json().get('response', {}).get('id')
            if not file_id:
                logger.warning(f"    * Could not resolve ID for {file_path_remote}, skipping")
                continue

            # Step 4b: get presigned download URL
            url_resp = None
            for attempt in range(5):
                resp = requests.get(
                    _url(f'/api/v2/storage/view-url/{file_id}'),
                    headers=_headers(api_key),
                    timeout=30,
                )
                resp.raise_for_status()
                media_link = resp.json().get('response', {}).get('mediaLink')
                if media_link:
                    url_resp = media_link
                    break
                import time
                time.sleep(2)

            if not url_resp:
                logger.warning(f"    * Could not get download URL for {file_name}, skipping")
                continue

            # Step 4c: download the file
            dest = Path(sim_path) / file_name
            logger.info(f"    * Downloading {file_name}...")
            dl = requests.get(url_resp, timeout=600, stream=True)
            dl.raise_for_status()
            with open(dest, 'wb') as f:
                for chunk in dl.iter_content(chunk_size=65536):
                    f.write(chunk)

            # Step 5: extract tar.gz in place
            if file_name.endswith('.tar.gz') or file_name.endswith('.tgz'):
                logger.info(f"    * Extracting {file_name}...")
                with tarfile.open(dest, 'r:gz') as tar:
                    tar.extractall(path=sim_path)
                dest.unlink()

        logger.info(f"    * All results downloaded to {sim_path}")
        return True

    except Exception as e:
        logger.error(f"    * Failed to download results for task {task_id}: {e}")
        return False
