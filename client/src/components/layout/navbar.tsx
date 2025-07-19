import { useState } from "react";
import { Link, useLocation } from "wouter";
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
import { AnalyticsButton } from "@/components/common/AnalyticsButton";
import { AnalyticsCategories, AnalyticsActions } from "@/lib/analyticsEvents";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/hooks/use-auth";
import { User, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export default function Navbar() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, setUser } = useAuth();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
      setUser(null);
      setLocation("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const scrollToSection = (sectionId: string) => {
    // Rastrear el clic en enlaces de navegación
    trackEvent(
      AnalyticsCategories.NAVIGATION,
      'section_navigation',
      `scroll_to_${sectionId}`
    );
    
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleLogoClick = () => {
    trackEvent(
      AnalyticsCategories.NAVIGATION,
      'logo_click',
      location === '/' ? 'scroll_to_top' : 'redirect_to_home'
    );

    if (location === '/') {
      // Si ya estamos en la landing page, hacer scroll al top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Si estamos en otra página, navegar a la landing page
      setLocation('/');
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={handleLogoClick}
        >
          <img 
            src="/assets/logo.png" 
            alt="FlowDesk Logo" 
            className="h-16 w-16 object-contain"
          />
          <span className="text-2xl font-bold text-primary">FlowDesk</span>
        </div>

        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={`${navigationMenuTriggerStyle()} ${location !== '/' ? 'text-gray-300 cursor-not-allowed hover:text-gray-300' : ''}`}
                onClick={location === '/' ? () => scrollToSection('case-studies') : undefined}
                style={{ cursor: location === '/' ? 'pointer' : 'not-allowed' }}
              >
                Case Studies
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={`${navigationMenuTriggerStyle()} ${location !== '/' ? 'text-gray-300 cursor-not-allowed hover:text-gray-300' : ''}`}
                onClick={location === '/' ? () => scrollToSection('certifications') : undefined}
                style={{ cursor: location === '/' ? 'pointer' : 'not-allowed' }}
              >
                Certifications
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={`${navigationMenuTriggerStyle()} ${location !== '/' ? 'text-gray-300 cursor-not-allowed hover:text-gray-300' : ''}`}
                onClick={location === '/' ? () => scrollToSection('hvac-solutions') : undefined}
                style={{ cursor: location === '/' ? 'pointer' : 'not-allowed' }}
              >
                HVAC Solutions
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={`${navigationMenuTriggerStyle()} ${location !== '/' ? 'text-gray-300 cursor-not-allowed hover:text-gray-300' : ''}`}
                onClick={location === '/' ? () => scrollToSection('pricing') : undefined}
                style={{ cursor: location === '/' ? 'pointer' : 'not-allowed' }}
              >
                Pricing
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={`${navigationMenuTriggerStyle()} ${location !== '/' ? 'text-gray-300 cursor-not-allowed hover:text-gray-300' : ''}`}
                onClick={location === '/' ? () => scrollToSection('contact') : undefined}
                style={{ cursor: location === '/' ? 'pointer' : 'not-allowed' }}
              >
                Contact Us
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-4">
          {user && !user.isAnonymous ? (
            // Usuario logueado - mostrar dropdown con información del usuario
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {user.username}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            // Usuario no logueado - mostrar botones de login y registro
            <>
              <AnalyticsButton 
                category={AnalyticsCategories.ACCOUNT} 
                action={AnalyticsActions.LOGIN}
                variant="outline" 
                onClick={() => setIsLoginOpen(true)}
              >
                Log in
              </AnalyticsButton>
              
              <AnalyticsButton 
                category={AnalyticsCategories.ACCOUNT} 
                action={AnalyticsActions.SIGNUP}
                onClick={() => setIsRegisterOpen(true)}
              >
                Sign Up
              </AnalyticsButton>
            </>
          )}
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