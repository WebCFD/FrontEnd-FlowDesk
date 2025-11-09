import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, insertUserSchema } from "@shared/schema";
import createMemoryStore from "memorystore";
import { getUncachableResendClient } from "./resend";

const MemoryStore = createMemoryStore(session);

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  try {
    const [hashed, salt] = stored.split(".");
    if (!hashed || !salt) {
      return false;
    }
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error("Error comparing passwords:", error);
    return false;
  }
}

async function sendWelcomeEmail(username: string, email: string) {
  try {
    console.log(`[Auth] 📧 Sending welcome email to ${email}...`);
    
    const { client, fromEmail } = await getUncachableResendClient();
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://flowdesk.es';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to FlowDesk</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <img src="${baseUrl}/assets/logo.png" alt="FlowDesk Logo" style="width: 179px; height: 80px; margin-bottom: 20px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold;">Welcome to FlowDesk!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Hi <strong>${username}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Thank you for joining <strong>FlowDesk</strong>! We're thrilled to have you on board. 
              </p>
              
              <p style="margin: 0 0 30px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                FlowDesk makes professional CFD thermal comfort simulations accessible to everyone. Whether you're an HVAC engineer, architect, or student, our cloud-based platform helps you optimize energy efficiency, improve comfort, and promote sustainability through advanced air flow analysis.
              </p>
              
              <!-- What's Next Section -->
              <div style="background-color: #f8fafc; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <h2 style="margin: 0 0 15px; color: #1f2937; font-size: 20px; font-weight: 600;">
                  What's Next?
                </h2>
                <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                  <li>Design multi-floor layouts with our intuitive 3D editor</li>
                  <li>Configure HVAC systems and thermal boundary conditions</li>
                  <li>Run cloud-powered CFD simulations in minutes</li>
                  <li>Analyze thermal comfort and energy efficiency metrics</li>
                  <li>Export results and optimize for sustainability</li>
                </ul>
              </div>
              
              <!-- CTA Button -->
              <table role="presentation" style="margin: 30px 0; width: 100%;">
                <tr>
                  <td align="center">
                    <a href="${baseUrl}/dashboard" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
                      Start Your First Simulation
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Features -->
              <div style="margin: 30px 0;">
                <h3 style="margin: 0 0 20px; color: #1f2937; font-size: 18px; font-weight: 600;">
                  Key Features You'll Love:
                </h3>
                <table role="presentation" style="width: 100%;">
                  <tr>
                    <td style="padding: 10px 0;">
                      <strong style="color: #667eea;">Cloud-Powered Computing:</strong>
                      <span style="color: #4b5563; font-size: 15px;"> No expensive hardware or software licenses needed</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;">
                      <strong style="color: #667eea;">Advanced 3D Design:</strong>
                      <span style="color: #4b5563; font-size: 15px;"> Multi-floor layouts with custom furniture placement</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;">
                      <strong style="color: #667eea;">Customized CFD Solver:</strong>
                      <span style="color: #4b5563; font-size: 15px;"> Professional-grade thermal comfort analysis</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;">
                      <strong style="color: #667eea;">Energy Efficiency:</strong>
                      <span style="color: #4b5563; font-size: 15px;"> Optimize HVAC systems for sustainability and cost savings</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;">
                      <strong style="color: #667eea;">Interactive Results:</strong>
                      <span style="color: #4b5563; font-size: 15px;"> 3D visualization and detailed performance metrics</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- Support -->
              <div style="margin: 30px 0; padding: 20px; background-color: #fef3c7; border-radius: 8px;">
                <p style="margin: 0; color: #92400e; font-size: 15px; line-height: 1.6;">
                  <strong>💡 Need Help?</strong><br>
                  Our team is here to support you. If you have any questions, feel free to reach out to us at 
                  <a href="mailto:info@flowdesk.es" style="color: #667eea; text-decoration: none; font-weight: 600;">info@flowdesk.es</a>
                </p>
              </div>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                Best regards,<br>
                <strong style="color: #1f2937;">The FlowDesk Team</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8fafc; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">
                <a href="https://flowdesk.es" style="color: #667eea; text-decoration: none; margin: 0 10px;">FlowDesk</a> |
                <a href="https://flowdesk.es/about" style="color: #667eea; text-decoration: none; margin: 0 10px;">About</a> |
                <a href="https://flowdesk.es/privacy" style="color: #667eea; text-decoration: none; margin: 0 10px;">Privacy</a> |
                <a href="https://flowdesk.es/terms" style="color: #667eea; text-decoration: none; margin: 0 10px;">Terms</a>
              </p>
              <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} FlowDesk. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
    
    const result = await client.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Welcome to FlowDesk - Your CFD Journey Starts Now!',
      html: html,
    });
    
    console.log(`[Auth] ✅ Welcome email sent successfully to ${email}`);
    return result;
  } catch (error) {
    console.error(`[Auth] ❌ Failed to send welcome email to ${email}:`, error);
    // Don't throw error - we don't want to fail registration if email fails
    return null;
  }
}

async function sendActivationEmail(username: string, email: string, token: string) {
  try {
    console.log(`[Auth] 📧 Sending activation email to ${email}...`);
    
    const { client, fromEmail } = await getUncachableResendClient();
    
    // Always use flowdesk.es in production, REPLIT_DEV_DOMAIN only in development
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://flowdesk.es'
      : (process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'http://localhost:5000');
    
    const activationLink = `${baseUrl}/activate?token=${token}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activate Your FlowDesk Account</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <img src="${baseUrl}/assets/logo.png" alt="FlowDesk Logo" style="width: 179px; height: 80px; margin-bottom: 20px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold;">Activate Your Account</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Hi <strong>${username}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Thank you for signing up for <strong>FlowDesk</strong>! To complete your registration and start running professional CFD simulations, please activate your account by clicking the button below.
              </p>
              
              <table role="presentation" style="margin: 30px 0; width: 100%;">
                <tr>
                  <td align="center">
                    <a href="${activationLink}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
                      Activate My Account
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 30px; color: #667eea; font-size: 14px; word-break: break-all;">
                ${activationLink}
              </p>
              
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>⏰ This link will expire in 24 hours.</strong> If you didn't create this account, you can safely ignore this email.
                </p>
              </div>
              
              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                <strong style="color: #1f2937;">The FlowDesk Team</strong>
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                <a href="https://flowdesk.es/privacy" style="color: #667eea; text-decoration: none; margin: 0 10px;">Privacy</a> |
                <a href="https://flowdesk.es/terms" style="color: #667eea; text-decoration: none; margin: 0 10px;">Terms</a>
              </p>
              <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} FlowDesk. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
    
    const result = await client.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Activate Your FlowDesk Account',
      html: html,
    });
    
    console.log(`[Auth] ✅ Activation email sent successfully to ${email}`);
    return result;
  } catch (error) {
    console.error(`[Auth] ❌ Failed to send activation email to ${email}:`, error);
    throw error; // Throw error - we want registration to fail if email fails
  }
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: 'your-secret-key',  // In production, this should be an environment variable
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    store: new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    })
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password'
    }, async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }

        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid email or password" });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/auth/register", async (req, res, next) => {
    try {
      // Validate request body against our schema
      const validatedData = insertUserSchema.parse(req.body);

      // Check if email already exists in users or pending activations
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const existingPending = await storage.getPendingActivationByEmail(validatedData.email);
      if (existingPending) {
        return res.status(400).json({ message: "A verification email has already been sent to this address. Please check your inbox." });
      }

      // Hash password and generate activation token
      const hashedPassword = await hashPassword(validatedData.password);
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store pending activation
      await storage.createPendingActivation({
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
        token,
        expiresAt,
      });

      // Send activation email
      await sendActivationEmail(validatedData.username, validatedData.email, token);

      res.status(201).json({ 
        message: "Registration successful! Please check your email to activate your account.",
        email: validatedData.email
      });
    } catch (error) {
      console.error('Registration error:', error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Registration failed" });
      }
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info.message || "Authentication failed" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/auth/activate", async (req, res, next) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: "Invalid activation link" });
      }

      // Cleanup expired activations first
      await storage.cleanupExpiredActivations();

      // Find pending activation by token
      const pending = await storage.getPendingActivationByToken(token);

      if (!pending) {
        return res.status(400).json({ message: "Invalid or expired activation link" });
      }

      // Check if token has expired
      if (new Date() > pending.expiresAt) {
        await storage.deletePendingActivation(pending.id);
        return res.status(400).json({ message: "Activation link has expired. Please register again." });
      }

      // Check if email already exists (someone might have registered with same email while this was pending)
      const existingUser = await storage.getUserByEmail(pending.email);
      if (existingUser) {
        await storage.deletePendingActivation(pending.id);
        return res.status(400).json({ message: "This email is already registered. Please try logging in." });
      }

      // Create the user
      const user = await storage.createUser({
        username: pending.username,
        email: pending.email,
        password: pending.password, // Already hashed
      });

      // Delete pending activation
      await storage.deletePendingActivation(pending.id);

      // Send welcome email (non-blocking)
      sendWelcomeEmail(user.username, user.email).catch(err => {
        console.error('[Auth] Welcome email failed but continuing activation:', err);
      });

      // Log user in automatically
      req.login(user, (err) => {
        if (err) return next(err);
        const { password, ...userWithoutPassword } = user;
        res.json({ 
          success: true, 
          message: "Account activated successfully! Welcome to FlowDesk.",
          user: userWithoutPassword
        });
      });
    } catch (error) {
      console.error('Activation error:', error);
      if (error instanceof Error) {
        res.status(500).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Activation failed" });
      }
    }
  });

  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });
}