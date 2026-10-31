import React from "react";

export function BonaSoftAtom({ className = "" }: { className?: string }) {
  return (
    <div className="relative flex items-center justify-center shrink-0">
      <svg
        viewBox="-16 -16 32 32"
        className={`h-6 w-6 sm:h-7 sm:w-7 overflow-visible drop-shadow-[0_0_12px_rgba(0,230,118,0.55)] transition-transform duration-300 group-hover:scale-110 group-active:scale-95 ${className}`}
        aria-hidden="true"
        fill="none"
      >
        <style>{`
          @keyframes bonaCorePulse {
            0%, 100% {
              transform: scale(0.92);
              filter: drop-shadow(0 0 4px rgba(0, 230, 118, 0.7));
            }
            50% {
              transform: scale(1.15);
              filter: drop-shadow(0 0 9px rgba(0, 245, 255, 0.95)) drop-shadow(0 0 14px rgba(0, 230, 118, 0.8));
            }
          }
          @keyframes bonaOrbitSpinA {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes bonaOrbitSpinB {
            from { transform: rotate(60deg); }
            to { transform: rotate(420deg); }
          }
          @keyframes bonaOrbitSpinC {
            from { transform: rotate(120deg); }
            to { transform: rotate(480deg); }
          }
          @keyframes bonaParticleGlow {
            0%, 100% { opacity: 0.55; transform: scale(0.85); }
            50% { opacity: 1; transform: scale(1.3); }
          }
          .bona-orbit-1 {
            animation: bonaOrbitSpinA 20s linear infinite;
            transform-origin: 0px 0px;
          }
          .bona-orbit-2 {
            animation: bonaOrbitSpinB 24s linear infinite reverse;
            transform-origin: 0px 0px;
          }
          .bona-orbit-3 {
            animation: bonaOrbitSpinC 28s linear infinite;
            transform-origin: 0px 0px;
          }
          .bona-core {
            animation: bonaCorePulse 3s ease-in-out infinite;
            transform-origin: 0px 0px;
          }
          .bona-pt {
            animation: bonaParticleGlow 2.4s ease-in-out infinite;
            transform-box: fill-box;
            transform-origin: center;
          }
        `}</style>

        <defs>
          <filter id="atomParticleGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="atomCoreHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
            <stop offset="35%" stopColor="#A7FFD7" stopOpacity={0.95} />
            <stop offset="70%" stopColor="#00E676" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#00E676" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Órbita 1 (Rotação contínua A) */}
        <g className="bona-orbit-1">
          <ellipse rx={12.5} ry={4.8} fill="none" stroke="#00E676" strokeWidth={0.85} strokeDasharray="1.5 2.5" opacity={0.65} />
          <circle cx={12.5} cy={0} r={0.9} fill="#00F5FF" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={-12.5} cy={0} r={0.9} fill="#69F0AE" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={0} cy={4.8} r={0.75} fill="#00E676" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={8.8} cy={3.4} r={0.65} fill="#E0FFF8" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={-8.8} cy={-3.4} r={0.8} fill="#00F5FF" filter="url(#atomParticleGlow)" className="bona-pt" />
        </g>

        {/* Órbita 2 (Rotação contínua B invertida) */}
        <g className="bona-orbit-2">
          <ellipse rx={12.5} ry={4.8} fill="none" stroke="#00E676" strokeWidth={0.85} strokeDasharray="1.5 2.5" opacity={0.65} />
          <circle cx={12.5} cy={0} r={0.9} fill="#69F0AE" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={-12.5} cy={0} r={0.9} fill="#00F5FF" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={0} cy={-4.8} r={0.75} fill="#00E676" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={8.8} cy={-3.4} r={0.8} fill="#00F5FF" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={-8.8} cy={3.4} r={0.65} fill="#E0FFF8" filter="url(#atomParticleGlow)" className="bona-pt" />
        </g>

        {/* Órbita 3 (Rotação contínua C) */}
        <g className="bona-orbit-3">
          <ellipse rx={12.5} ry={4.8} fill="none" stroke="#00E676" strokeWidth={0.85} strokeDasharray="1.5 2.5" opacity={0.65} />
          <circle cx={12.5} cy={0} r={0.9} fill="#00F5FF" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={-12.5} cy={0} r={0.9} fill="#69F0AE" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={0} cy={4.8} r={0.8} fill="#E0FFF8" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={8.8} cy={3.4} r={0.75} fill="#00E676" filter="url(#atomParticleGlow)" className="bona-pt" />
          <circle cx={-8.8} cy={-3.4} r={0.8} fill="#00F5FF" filter="url(#atomParticleGlow)" className="bona-pt" />
        </g>

        {/* Núcleo Quântico com Brilho e Pulsação Fluida */}
        <g className="bona-core">
          <circle r={3.2} fill="url(#atomCoreHalo)" />
          <circle r={1.6} fill="#00F5FF" opacity={0.95} filter="url(#atomParticleGlow)" />
          <circle r={0.9} fill="#ffffff" />
        </g>
      </svg>
    </div>
  );
}

export interface BonaSoftLogoProps {
  className?: string;
  variant?: string;
  dark?: boolean;
  showSubtitle?: boolean;
}

export function BonaSoftLogo({ className = "", showSubtitle = false }: BonaSoftLogoProps) {
  return (
    <div className={`w-full sm:w-auto flex items-center justify-center text-center select-none ${className}`}>
      <a
        href="https://bonasoftmt.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-2.5 focus:outline-none cursor-pointer py-1 select-none"
        aria-label="Acessar site oficial da BonaSoft"
      >
        <BonaSoftAtom />
        <div className="flex flex-col text-left">
          <span className="font-sans font-light tracking-[0.24em] text-sm sm:text-base leading-none text-zinc-300 uppercase transition-colors duration-200 group-hover:text-white group-active:text-white pl-[0.24em]">
            BONASOFT
          </span>
          {showSubtitle && (
            <span className="font-sans font-normal tracking-[0.18em] text-[8px] sm:text-[9px] text-zinc-400 uppercase leading-tight mt-0.5 transition-colors duration-200 group-hover:text-zinc-200 pl-[0.18em]">
              Desenvolvimento de Sistemas
            </span>
          )}
        </div>
      </a>
    </div>
  );
}

export const BonaSoftBrand = BonaSoftLogo;

