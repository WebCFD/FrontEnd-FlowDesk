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

export default function Navbar() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [, setLocation] = useLocation();

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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => {
            trackEvent(
              AnalyticsCategories.NAVIGATION,
              'logo_click',
              'redirect_to_home'
            );
            setLocation('/');
          }}
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
                onClick={() => scrollToSection('certifications')}
                style={{ cursor: 'pointer' }}
              >
                Certifications
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={navigationMenuTriggerStyle()}
                onClick={() => scrollToSection('hvac-solutions')}
                style={{ cursor: 'pointer' }}
              >
                HVAC Solutions
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
            <NavigationMenuItem>
              <NavigationMenuLink 
                className={navigationMenuTriggerStyle()}
                onClick={() => scrollToSection('contact')}
                style={{ cursor: 'pointer' }}
              >
                Contact Us
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-4">
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