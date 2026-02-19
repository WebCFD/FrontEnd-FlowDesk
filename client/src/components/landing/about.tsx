import { motion } from "framer-motion";
import { Wind, Zap, Users, Globe } from "lucide-react";

export default function About() {
  return (
    <section id="about" className="py-20">
      <div className="container mx-auto px-4 max-w-5xl">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl font-bold mb-4">About FlowDesk</h2>
          <p className="text-lg text-muted-foreground">
            Making aerodynamics and thermal comfort accessible to everyone through cloud-based CFD simulations
          </p>
        </motion.div>

        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          viewport={{ once: true }}
        >
          <h3 className="text-3xl font-semibold mb-6">Our Mission</h3>
          <p className="text-lg leading-relaxed mb-4">
            At FlowDesk, we believe that advanced computational fluid dynamics (CFD) simulations shouldn't be reserved for large corporations with expensive infrastructure. Our mission is to democratize access to professional-grade HVAC thermal comfort analysis, making it accessible to engineers, architects, consultants, and students worldwide.
          </p>
          <p className="text-lg leading-relaxed">
            By combining cutting-edge cloud computing with an intuitive web interface, we're breaking down the barriers that have traditionally made CFD simulation complex, expensive, and time-consuming.
          </p>
        </motion.div>

        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          viewport={{ once: true }}
        >
          <h3 className="text-3xl font-semibold mb-6">What We Do</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-50 p-6 rounded-lg">
              <Wind className="h-10 w-10 text-primary mb-4" />
              <h4 className="text-xl font-semibold mb-3">CFD Made Simple</h4>
              <p>
                We've simplified the complex process of setting up and running OpenFOAM CFD simulations. Design your space in 3D, configure air flow parameters, and let our cloud platform handle the heavy computational work.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-lg">
              <Zap className="h-10 w-10 text-primary mb-4" />
              <h4 className="text-xl font-semibold mb-3">Cloud-Powered Speed</h4>
              <p>
                Leveraging Inductiva's cloud infrastructure, we process simulations faster than traditional desktop setups. No expensive hardware required—just upload your design and get results in minutes.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-lg">
              <Users className="h-10 w-10 text-primary mb-4" />
              <h4 className="text-xl font-semibold mb-3">Built for Professionals</h4>
              <p>
                Whether you're an HVAC engineer optimizing building comfort, an architect verifying design decisions, or a student learning CFD fundamentals, FlowDesk provides the tools you need.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-lg">
              <Globe className="h-10 w-10 text-primary mb-4" />
              <h4 className="text-xl font-semibold mb-3">Accessible Anywhere</h4>
              <p>
                Work from anywhere with an internet connection. Our web-based platform eliminates software installation, licensing headaches, and hardware limitations.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          viewport={{ once: true }}
        >
          <h3 className="text-3xl font-semibold mb-6">Our Story</h3>
          <p className="text-lg leading-relaxed mb-4">
            FlowDesk was born from a simple observation: while CFD technology has advanced tremendously, accessing it remains unnecessarily complicated. Traditional CFD workflows require extensive training, expensive software licenses, and powerful hardware infrastructure.
          </p>
          <p className="text-lg leading-relaxed mb-4">
            We saw an opportunity to change this. By combining modern web technologies with cloud-based high-performance computing, we've created a platform that makes professional CFD analysis accessible to a broader audience without compromising on accuracy or capabilities.
          </p>
          <p className="text-lg leading-relaxed">
            Today, FlowDesk serves engineers, architects, consultants, and researchers who need reliable thermal comfort simulations without the traditional barriers to entry.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          viewport={{ once: true }}
        >
          <h3 className="text-3xl font-semibold mb-6">Our Commitment</h3>
          <div className="bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg">
            <p className="text-lg leading-relaxed mb-4">
              <strong>Quality First:</strong> We're committed to providing accurate, reliable simulations that meet professional engineering standards.
            </p>
            <p className="text-lg leading-relaxed mb-4">
              <strong>Continuous Innovation:</strong> We constantly improve our platform based on user feedback and the latest advances in CFD technology.
            </p>
            <p className="text-lg leading-relaxed mb-4">
              <strong>Transparent Pricing:</strong> No hidden fees, no surprise charges. Pay per simulation or choose a subscription that fits your needs.
            </p>
            <p className="text-lg leading-relaxed">
              <strong>Customer Support:</strong> Our team is here to help you succeed, whether you're running your first simulation or your thousandth.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}