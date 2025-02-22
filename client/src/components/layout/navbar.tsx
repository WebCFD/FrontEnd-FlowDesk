import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import RegisterModal from "@/components/auth/register-modal";
import LoginModal from "@/components/auth/login-modal";

export default function Navbar() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img 
            src="/attached_assets/image_1740210987890.png" 
            alt="FlowDesk Logo" 
            className="h-8 w-8"
          />
          <span className="text-2xl font-bold text-primary">FlowDesk</span>
        </div>

        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={navigationMenuTriggerStyle()}
                onClick={() => scrollToSection('features')}
                style={{ cursor: 'pointer' }}
              >
                Features
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={navigationMenuTriggerStyle()}
                onClick={() => scrollToSection('case-studies')}
                style={{ cursor: 'pointer' }}
              >
                Case Studies
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={navigationMenuTriggerStyle()}
                onClick={() => scrollToSection('pricing')}
                style={{ cursor: 'pointer' }}
              >
                Pricing
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setIsLoginOpen(true)}>Log in</Button>
          <Button onClick={() => setIsRegisterOpen(true)}>Sign Up</Button>
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
    </header>
  );
}