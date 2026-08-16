import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const CTA = () => {
  return (
    <section className="py-24 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mx-auto bg-primary rounded-3xl p-12 md:p-16 text-center"
      >
        <h2 className="text-3xl md:text-4xl font-display text-primary-foreground mb-4">
          Ready to get started?
        </h2>
        <p className="text-primary-foreground/80 text-lg mb-8 max-w-md mx-auto">
          Join thousands who are already building the future with us.
        </p>
        <Button
          size="lg"
          variant="secondary"
          className="gap-2 text-base px-8"
        >
          Start Now <ArrowRight className="w-4 h-4" />
        </Button>
      </motion.div>
    </section>
  );
};

export default CTA;
