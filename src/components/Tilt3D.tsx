import { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Maximum tilt in degrees. */
  max?: number;
  /** Lift towards the viewer on hover, in px. */
  lift?: number;
}

// Tilts its content in 3D towards the pointer (finger or mouse). With "reduce motion" on, it renders plain.
export default function Tilt3D({ children, className, max = 10, lift = 12 }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 220, damping: 22 });
  const sy = useSpring(py, { stiffness: 220, damping: 22 });
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const z = useMotionValue(0);
  const sz = useSpring(z, { stiffness: 220, damping: 22 });

  if (reduce) return <div className={className}>{children}</div>;

  const move = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
    z.set(lift);
  };
  const leave = () => { px.set(0.5); py.set(0.5); z.set(0); };

  return (
    <div className={className} style={{ perspective: 900 }}>
      <motion.div
        ref={ref}
        onPointerMove={move}
        onPointerLeave={leave}
        onPointerCancel={leave}
        onPointerUp={e => { if (e.pointerType !== 'mouse') leave(); }}
        style={{ rotateX, rotateY, z: sz, transformStyle: 'preserve-3d' }}
        className="h-full will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}
