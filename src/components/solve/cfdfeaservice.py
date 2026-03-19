"""
CFD FEA Service cloud solver integration.

API base: https://cloud.cfdfeaservice.it  (v1 endpoints)
Auth:     X-API-Key header

Upload flow:
  1. POST /api/v2/storage/upload-url  → presigned PUT URL
  2. PUT  <presigned_url>             → direct upload of zip (no auth header)
  3. DELETE /api/v2/user/delete-cache → invalidate server cache

Submit flow:
  POST /api/v2/simulation
  Body: {"data": {"cpu": <n>, "ram": <label>, "folder": <name>, "script": <name>}}
  Returns simulation ID

Status flow:
  GET /api/v2/simulation/{id}  → response.status (int)
    20 = pending
    30 = running
    40 = queued/preparing
    10 = completed
    60 = error

Download flow:
  GET  /api/v2/simulation/{id}               → response.folder (name)
  GET  /api/v2/storage/index/name/asc/1      → list root folders, find folder_id
  GET  /api/v2/storage/index/size/desc/parent_id/{folder_id}/1  → list files
  POST /api/v2/storage/view-by-path          → file_id
  GET  /api/v2/storage/view-url/{file_id}    → response.mediaLink (direct URL)
  download via GET <mediaLink>
"""

import os
import zipfile
import tempfile
import logging
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

CFDFEASERVICE_HOST = os.getenv('CFDFEASERVICE_HOST', 'https://cloud.cfdfeaservice.it')

# Numeric status codes (GET /api/v2/simulation/{id})
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
    Compress sim_path to a zip file and upload it to CFD FEA Service storage.

    Uses the presigned-URL upload flow:
      1. POST /api/v2/storage/upload-url → { response: { url: <presigned_put_url> } }
      2. PUT <presigned_url> with the zip (no auth header — presigned URL is self-authenticating)
      3. DELETE /api/v2/user/delete-cache

    Args:
        sim_path: Local path to the OpenFOAM simulation directory.
        api_key:  CFDFEASERVICE_API_KEY value.

    Returns:
        folder_name (str) used to submit and later download results.
    """
    # Remote folder name = case directory name (e.g. "sim_42")
    folder_name = Path(sim_path).parent.name

    logger.info(f"    * Compressing simulation directory: {sim_path}")

    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
        zip_path = tmp.name

    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            base = Path(sim_path)
            for file in base.rglob('*'):
                if file.is_file():
                    arcname = Path(folder_name) / file.relative_to(base)
                    zf.write(file, arcname)

        zip_size_mb = Path(zip_path).stat().st_size / (1024 * 1024)
        logger.info(f"    * Zip created: {zip_path} ({zip_size_mb:.1f} MB)")

        # Step 1: get presigned upload URL
        payload = {
            'folder': folder_name,
            'filename': 'upload.zip',
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

        # Step 2: PUT file directly to presigned URL (no API key — presigned)
        logger.info(f"    * Uploading zip to cloud storage...")
        with open(zip_path, 'rb') as f:
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
            Path(zip_path).unlink()
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
    cpu    = os.getenv('CFDFEASERVICE_CPU', '2')
    ram    = os.getenv('CFDFEASERVICE_RAM', 'standard')
    script = os.getenv('CFDFEASERVICE_SCRIPT', 'openFoam-v2412')

    payload = {
        'cpu':    int(cpu),
        'ram':    ram,
        'folder': folder,
        'script': script,
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
    if not resp.ok:
        logger.error(f"    * Simulation submit error {resp.status_code}: {resp.text[:500]}")
    resp.raise_for_status()
    data = resp.json()

    task_id = (
        data.get('response')
        or data.get('id')
        or data.get('taskId')
        or data.get('simulation_id')
    )
    if task_id is None:
        raise ValueError(f"No simulation ID in POST /api/v2/simulation/add response: {data}")

    logger.info(f"    * Simulation submitted — task_id: {task_id}")
    return str(task_id)


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

def check_status(task_id: str, api_key: str) -> int:
    """
    Check simulation status via GET /api/v2/simulation/view/{id}.

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
        _url(f'/api/v2/simulation/view/{task_id}'),
        headers=_headers(api_key),
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    # Support both flat and nested response formats
    status = (
        (data.get('response') or {}).get('status')
        or data.get('status')
        or data.get('state')
        or data.get('statusCode')
    )
    if status is None:
        raise ValueError(f"No status field in GET /api/v2/simulation/{task_id} response: {data}")

    return int(status)


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def _safe_extract_zip(zip_path: Path, dest_dir: Path) -> None:
    """
    Extract a zip archive with path traversal protection.
    Skips any member whose resolved path falls outside dest_dir.
    """
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for member in zf.infolist():
            member_path = (dest_dir / member.filename).resolve()
            if not str(member_path).startswith(str(dest_dir.resolve())):
                logger.warning(f"    * Skipping unsafe zip member: {member.filename}")
                continue
            zf.extract(member, dest_dir)


def download_results(task_id: str, sim_path: str, api_key: str) -> bool:
    """
    Download simulation results from CFD FEA Service to sim_path.

    Flow:
      1. GET /api/v2/simulation/{id}                              → response.folder
      2. GET /api/v2/storage/index/name/asc/1                    → find folder_id
      3. GET /api/v2/storage/index/size/desc/parent_id/{fid}/1   → file list
      4. For each result file:
           POST /api/v2/storage/view-by-path  → file_id
           GET  /api/v2/storage/view-url/{id} → response.mediaLink
           GET  <mediaLink>                   → download
      5. Extract zip files with path traversal protection

    Args:
        task_id:  Simulation ID returned by submit_simulation().
        sim_path: Local directory where results will be saved.
        api_key:  CFDFEASERVICE_API_KEY value.

    Returns:
        True on success, False on failure.
    """
    try:
        dest_dir = Path(sim_path)
        dest_dir.mkdir(parents=True, exist_ok=True)

        # Step 1: get folder name from simulation record
        logger.info(f"    * Getting simulation record for task {task_id}...")
        resp = requests.get(
            _url(f'/api/v2/simulation/view/{task_id}'),
            headers=_headers(api_key),
            timeout=30,
        )
        resp.raise_for_status()
        sim_data = resp.json().get('response') or resp.json()
        folder_name = sim_data.get('folder') if isinstance(sim_data, dict) else None
        if not folder_name:
            raise ValueError(f"No folder in GET /api/v2/simulation/view/{task_id}: {resp.json()}")
        logger.info(f"    * Results folder: {folder_name}")

        # Step 2: list root storage folders with pagination to find folder_id
        folder_id = None
        for page in range(1, 20):  # paginate up to 20 pages (each page ~50 items)
            resp = requests.get(
                _url(f'/api/v2/storage/index/name/asc/{page}'),
                headers=_headers(api_key),
                timeout=30,
            )
            resp.raise_for_status()
            page_folders = resp.json().get('response', [])
            if not page_folders:
                break  # no more pages
            for f in page_folders:
                if f.get('basename') == folder_name or f.get('name') == folder_name:
                    folder_id = f.get('id')
                    break
            if folder_id is not None:
                break
        if folder_id is None:
            raise ValueError(f"Folder '{folder_name}' not found in storage index")
        logger.info(f"    * Found folder_id: {folder_id}")

        # Step 3: list files in folder with pagination
        files = []
        for page in range(1, 20):  # paginate up to 20 pages
            resp = requests.get(
                _url(f'/api/v2/storage/index/size/desc/parent_id/{folder_id}/{page}'),
                headers=_headers(api_key),
                timeout=30,
            )
            resp.raise_for_status()
            page_files = resp.json().get('response', [])
            if not page_files:
                break  # no more pages
            files.extend(page_files)

        # Filter result archives; fall back to all files if no known extension found
        result_files = [
            f for f in files
            if any(
                (f.get('name') or '').endswith(ext)
                for ext in ('.zip', '.tar.gz', '.tgz', '.rmed', '.frd')
            )
        ]
        if not result_files:
            result_files = files

        logger.info(f"    * Found {len(result_files)} result file(s) to download")

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
            file_id = (resp.json().get('response') or {}).get('id')
            if not file_id:
                logger.warning(f"    * Could not resolve ID for {file_path_remote}, skipping")
                continue

            # Step 4b: get presigned download URL (retry until available)
            import time as _time
            media_link = None
            for _ in range(5):
                resp = requests.get(
                    _url(f'/api/v2/storage/view-url/{file_id}'),
                    headers=_headers(api_key),
                    timeout=30,
                )
                resp.raise_for_status()
                media_link = (resp.json().get('response') or {}).get('mediaLink')
                if media_link:
                    break
                _time.sleep(2)

            if not media_link:
                logger.warning(f"    * Could not get download URL for {file_name}, skipping")
                continue

            # Step 4c: download the file
            dest = dest_dir / file_name
            logger.info(f"    * Downloading {file_name}...")
            dl = requests.get(media_link, timeout=600, stream=True)
            dl.raise_for_status()
            with open(dest, 'wb') as fh:
                for chunk in dl.iter_content(chunk_size=65536):
                    fh.write(chunk)

            # Step 5: extract archives with path traversal protection
            if file_name.endswith('.zip'):
                logger.info(f"    * Extracting {file_name} (zip, path-safe)...")
                _safe_extract_zip(dest, dest_dir)
                dest.unlink()
            elif file_name.endswith('.tar.gz') or file_name.endswith('.tgz'):
                import tarfile as _tarfile
                logger.info(f"    * Extracting {file_name} (tar.gz, path-safe)...")
                with _tarfile.open(dest, 'r:gz') as tar:
                    for member in tar.getmembers():
                        member_path = (dest_dir / member.name).resolve()
                        if not str(member_path).startswith(str(dest_dir.resolve())):
                            logger.warning(f"    * Skipping unsafe tar member: {member.name}")
                            continue
                        tar.extract(member, dest_dir)
                dest.unlink()

        logger.info(f"    * All results downloaded to {sim_path}")
        return True

    except Exception as e:
        logger.error(f"    * Failed to download results for task {task_id}: {e}")
        return False
