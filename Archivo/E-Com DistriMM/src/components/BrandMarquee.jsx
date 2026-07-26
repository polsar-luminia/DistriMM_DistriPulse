const MARCAS = [
  'VIRBAC', 'VECOL', 'ITALCOL', 'SOLLA', 'BAYER',
  'OUROFINO', 'BIOGENESIS', 'PIONEER', 'CONTEGRAL', 'REFISAL',
]

export default function BrandMarquee() {
  const items = [...MARCAS, ...MARCAS, ...MARCAS]

  return (
    <div className="brand-marquee">
      <div className="brand-marquee__label">
        <span>NUESTRAS MARCAS</span>
      </div>
      <div className="brand-marquee__track">
        <div className="brand-marquee__inner">
          {items.map((marca, i) => (
            <span key={i} className="brand-marquee__item">
              {marca}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        .brand-marquee {
          display: flex;
          align-items: stretch;
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          overflow: hidden;
          height: 48px;
        }

        .brand-marquee__label {
          display: flex;
          align-items: center;
          padding: 0 20px;
          background: var(--green-deep, #1B5232);
          color: #fff;
          font-size: 0.6rem;
          font-weight: 800;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          white-space: nowrap;
          flex-shrink: 0;
          position: relative;
        }
        .brand-marquee__label::after {
          content: '';
          position: absolute;
          right: -12px;
          top: 0;
          bottom: 0;
          width: 24px;
          background: var(--green-deep, #1B5232);
          clip-path: polygon(0 0, 0 100%, 100% 50%);
        }

        .brand-marquee__track {
          flex: 1;
          overflow: hidden;
          mask-image: linear-gradient(to right, transparent, black 60px, black calc(100% - 60px), transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 60px, black calc(100% - 60px), transparent);
        }

        .brand-marquee__inner {
          display: flex;
          align-items: center;
          height: 100%;
          width: max-content;
          animation: marqueeScroll 35s linear infinite;
        }

        .brand-marquee__item {
          display: flex;
          align-items: center;
          padding: 0 28px;
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #9CA3AF;
          white-space: nowrap;
          text-transform: uppercase;
          position: relative;
        }
        .brand-marquee__item::after {
          content: '';
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #D1D5DB;
        }
        .brand-marquee__item:hover {
          color: var(--green-deep, #1B5232);
        }

        @keyframes marqueeScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }

        @media (max-width: 640px) {
          .brand-marquee__label { padding: 0 12px; font-size: 0.55rem; }
          .brand-marquee__label::after { right: -8px; width: 16px; }
          .brand-marquee__item { padding: 0 20px; font-size: 0.7rem; }
        }
      `}</style>
    </div>
  )
}
