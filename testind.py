import os
import sys
import time
import signal

sys.path.append('.')

import inductiva

api_key = os.getenv('INDUCTIVA_API_KEY')
if not api_key:
    print("ERROR: INDUCTIVA_API_KEY not set")
    sys.exit(1)
os.environ['INDUCTIVA_API_KEY'] = api_key


def test_wait_behavior():
    """Test why task.wait() blocks in Replit."""

    task_id = "nk8cgn5oiw52fu94pgnf3bsa5"
    task = inductiva.tasks.Task(task_id)

    print("=" * 60)
    print("DIAGNOSTICO: Por qué wait() se bloquea")
    print("=" * 60)

    # Test 1: get_status() funciona?
    print("\n1. Testing get_status()...")
    try:
        status = task.get_status()
        print(f"   ✓ get_status() works: {status}")
    except Exception as e:
        print(f"   ✗ get_status() failed: {e}")
        return

    # Test 2: get_info() da más detalles?
    print("\n2. Testing get_info()...")
    try:
        info = task.get_info()
        print(f"   ✓ Available fields: {list(info.keys())}")
        print(f"   ✓ Status: {info.get('status')}")
    except Exception as e:
        print(f"   ⚠ get_info() not available: {e}")

    # Test 3: Manual polling funciona?
    print("\n3. Testing manual polling (30s)...")
    for i in range(3):
        status = task.get_status()
        print(f"   [{i*10}s] Status: {status}")
        time.sleep(10)
    print("   ✓ Manual polling works")

    # Test 4: wait() se bloquea?
    print("\n4. Testing task.wait() with 30s timeout...")

    def timeout_handler(signum, frame):
        print("   ✗ wait() BLOCKED for 30s")
        print("\n" + "=" * 60)
        print("CONCLUSION: wait() se bloquea indefinidamente")
        print("SOLUCION: Usar manual polling")
        print("=" * 60)
        sys.exit(1)

    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(30)

    try:
        task.wait()
        signal.alarm(0)
        print("   ✓ wait() returned (not blocked)")
        print("\n" + "=" * 60)
        print("CONCLUSION: wait() funciona correctamente")
        print("=" * 60)
    except Exception as e:
        signal.alarm(0)
        print(f"   ✗ wait() exception: {e}")


if __name__ == "__main__":
    test_wait_behavior()
