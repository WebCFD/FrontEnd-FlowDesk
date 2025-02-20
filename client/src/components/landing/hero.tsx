import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import RegisterModal from "@/components/auth/register-modal";

export default function Hero() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center">
      <div 
        className="absolute inset-0 -z-10 bg-cover bg-center opacity-10"
        style={{ 
          backgroundImage: "url('https://images.unsplash.com/photo-1634712282287-14ed57b9cc89')" 
        }}
      />

      <div className="container mx-auto px-4 py-20">
        <div className="max-w-3xl">
          <motion.h1 
            className="text-5xl sm:text-6xl font-bold mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Cloud-Based Aerodynamics Simulation
          </motion.h1>

          <motion.p 
            className="text-xl text-muted-foreground mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Optimize your designs with powerful CFD technology. No hardware required, just upload your 3D model and get results within hours.
          </motion.p>

          <motion.div
            className="flex gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Button size="lg" onClick={() => setIsRegisterOpen(true)}>Start Free Trial</Button>
            <Button size="lg" variant="outline">Watch Demo</Button>
          </motion.div>
        </div>
      </div>

      <RegisterModal 
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />
    </div>
  );
}