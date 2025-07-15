/**
 * Test page for AirEntry Controller
 */

import AirEntryControllerDemo from '../components/debug/AirEntryControllerDemo';

export default function AirEntryControllerTest() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AirEntryControllerDemo currentFloor="ground" />
    </div>
  );
}