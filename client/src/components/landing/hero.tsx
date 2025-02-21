import { useState, Suspense } from "react";
import { motion } from "framer-motion";
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Button } from "@/components/ui/button";
import { RoomVisualization } from "../3d/room-visualization";
import RegisterModal from "@/components/auth/register-modal";
import LoginModal from "@/components/auth/login-modal";
import React from 'react';

export default function Hero() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center">
      <div className="container mx-auto px-4 py-20 flex justify-between items-center">
        <div className="max-w-2xl">
          <motion.h1 
            className="text-5xl sm:text-6xl font-bold mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Aerodynamics made easy
          </motion.h1>

          <motion.p 
            className="text-xl text-muted-foreground mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Save time and money with zero license fees, support for non-watertight models, and a fully automated workflow.
          </motion.p>

          <motion.div
            className="flex gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Button size="lg" onClick={() => setIsLoginOpen(true)}>Get Started</Button>
            <Button size="lg" variant="outline" onClick={() => setIsRegisterOpen(true)}>Sign Up</Button>
          </motion.div>
        </div>

        <div className="hidden lg:block w-[600px] h-[400px] relative">
          <ErrorBoundary>
            <Suspense fallback={<div className="w-full h-full bg-slate-100 animate-pulse rounded-lg" />}>
              <Canvas 
                shadows 
                dpr={[1, 2]}
                camera={{ position: [10, 5, 10], fov: 50 }}
                gl={{ preserveDrawingBuffer: true }}
              >
                <ambientLight intensity={0.5} />
                <directionalLight
                  position={[10, 10, 5]}
                  intensity={1}
                  castShadow
                />
                <RoomVisualization />
                <OrbitControls 
                  enableZoom={false} 
                  autoRotate={true}
                  autoRotateSpeed={1}
                />
              </Canvas>
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      <RegisterModal 
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      />
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 rounded-lg">
          <p className="text-sm text-muted-foreground">Unable to load 3D visualization</p>
        </div>
      );
    }

    return this.props.children;
  }
}