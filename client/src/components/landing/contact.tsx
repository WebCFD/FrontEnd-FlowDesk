import { motion } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, Linkedin } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

declare global {
  interface Window {
    turnstile?: {
      render: (element: string | HTMLElement, options: any) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default function Contact() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string>("");
  
  const { data: config } = useQuery({
    queryKey: ['/api/config'],
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
    },
  });

  useEffect(() => {
    if (!config?.turnstileSiteKey) return;

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      if (window.turnstile && turnstileRef.current && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: config.turnstileSiteKey,
          callback: (token: string) => {
            setTurnstileToken(token);
          },
          'error-callback': () => {
            setTurnstileToken('');
          },
          theme: 'light',
          size: 'normal',
        });
      }
    };
    
    document.body.appendChild(script);

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = '';
      }
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [config?.turnstileSiteKey]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          turnstileToken
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to send message");
      }

      toast({
        title: "Message sent!",
        description: "We'll get back to you as soon as possible. Thank you for contacting us.",
      });
      form.reset();
      
      // Reset Turnstile widget
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        setTurnstileToken('');
      }
    } catch (error) {
      console.error("Contact form error:", error);
      toast({
        variant: "destructive",
        title: "Error sending message",
        description: error instanceof Error ? error.message : "Failed to send message. Please try again.",
      });
      
      // Reset Turnstile on error
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        setTurnstileToken('');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section id="contact" className="py-20">
      <div className="container mx-auto px-4">
        <motion.div 
          className="max-w-2xl mx-auto text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl font-bold mb-4">Get in Touch</h2>
          <p className="text-lg text-muted-foreground">
            Have questions about our platform? We're here to help.
          </p>
        </motion.div>

        <motion.div
          className="max-w-xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          viewport={{ once: true }}
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Your name" 
                        disabled={isSubmitting}
                        data-testid="input-contact-name"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input 
                        type="email"
                        placeholder="tu@email.com" 
                        disabled={isSubmitting}
                        data-testid="input-contact-email"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="How can we help you?"
                        className="min-h-[120px]"
                        disabled={isSubmitting}
                        data-testid="textarea-contact-message"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {config?.turnstileSiteKey && (
                <div className="flex flex-col items-center gap-2">
                  <div ref={turnstileRef} data-testid="turnstile-widget"></div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Protected by Cloudflare Turnstile
                  </p>
                </div>
              )}
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting || (config?.turnstileSiteKey && !turnstileToken)}
                data-testid="button-send-contact"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Message"
                )}
              </Button>
            </form>
          </Form>
        </motion.div>

        <motion.div
          className="max-w-xl mx-auto mt-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          viewport={{ once: true }}
        >
          <div className="bg-slate-50 p-8 rounded-lg">
            <p className="text-lg mb-6">
              Want to learn more about our team and company updates?
            </p>
            <a 
              href="https://www.linkedin.com/company/webcfd/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#0A66C2] hover:bg-[#004182] text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              data-testid="link-linkedin"
            >
              <Linkedin className="h-5 w-5" />
              Follow us on LinkedIn
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}