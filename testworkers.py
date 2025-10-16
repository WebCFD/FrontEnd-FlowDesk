import time
import requests
import json

API_BASE = 'http://localhost:5000'
API_KEY = 'flowerpower-external-api'


def monitor_simulation(sim_id):
    """Monitorea progreso de simulación"""

    print(f"\n📊 Monitoring simulation {sim_id}...")
    print("=" * 60)

    last_status = None

    while True:
        response = requests.get(
            f"{API_BASE}/api/external/simulations/{sim_id}",
            headers={'x-api-key': API_KEY})

        if not response.ok:
            print(f"❌ Failed: {response.status_code}")
            time.sleep(10)
            continue

        sim = response.json()
        status = sim.get('status')
        progress = sim.get('progress', 0)
        current_step = sim.get('currentStep', 'N/A')

        if status != last_status:
            print(
                f"[{time.strftime('%H:%M:%S')}] {status} | {progress}% | {current_step}"
            )
            last_status = status

        if status in ['completed', 'failed']:
            print("\n" + "=" * 60)
            print(f"{'🎉 COMPLETED' if status == 'completed' else '❌ FAILED'}")
            print("=" * 60)
            if status == 'completed':
                print(f"Results: {json.dumps(sim.get('result'), indent=2)}")
            else:
                print(f"Error: {sim.get('errorMessage')}")
            break

        time.sleep(5)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python3 test_workers.py <simulation_id>")
        sys.exit(1)

    sim_id = int(sys.argv[1])

    print("=" * 60)
    print("WORKER MONITORING TEST")
    print("=" * 60)
    print("\nInstrucciones:")
    print("1. Terminal 1: python3 worker_submit.py")
    print("2. Terminal 2: python3 worker_monitor.py")
    print("3. Este terminal: monitoreando progreso\n")

    monitor_simulation(sim_id)
