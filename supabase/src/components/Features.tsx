import { motion } from "framer-motion";
import { Zap, Shield, Sparkles } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Optimized for speed and performance from the ground up.",
  },
  {
    icon: Shield,
    title: "Secure by Default",
    description: "Built with best practices to keep your data safe.",
  },
  {
    icon: Sparkles,
    title: "Beautiful Design",
    description: "Thoughtful details that make every interaction delightful.",
  },
];

const Features = () => {
  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-3xl md:text-5xl font-display text-foreground text-center mb-16"
        >
          Why choose us
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="bg-card rounded-2xl p-8 border border-border hover:shadow-lg transition-shadow"
            >
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-5">
                <feature.icon className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="text-xl font-display text-card-foreground mb-2">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
