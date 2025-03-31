import React from "react";

interface Canvas3DMinimalProps {
  wallTransparency: number;
}

export default function Canvas3DMinimal({
  wallTransparency = 0.5,
}: Canvas3DMinimalProps) {
  // Simple placeholder to verify routing works
  return (
    <div 
      style={{ 
        width: "100%", 
        height: "400px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#f0f0f0"
      }}
    >
      <h2>Canvas3D Test Component</h2>
      <p>Wall transparency: {wallTransparency.toFixed(2)}</p>
      <div 
        style={{
          width: "100px",
          height: "100px",
          backgroundColor: `rgba(0, 255, 0, ${wallTransparency})`,
          border: "1px solid #999"
        }}
      />
    </div>
  );
}