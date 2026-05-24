import { motion } from "framer-motion";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  pageKey?: string;
}

export default function PageTransition({
  children,
  pageKey,
}: Props) {
  return (
    <motion.div
      key={pageKey}
      initial={{
        opacity: 0,
        x: 40,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
      exit={{
        opacity: 0,
        x: -40,
      }}
      transition={{
        duration: 0.35,
        ease: "easeInOut",
      }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}
