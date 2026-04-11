'use client';

/**
 * AddPropertyButton — unified Add Property entry point (ADR-010 I2 + I7).
 *
 * Replaces the standalone components/property/AddFromExposeButton.tsx
 * from ADR-009 DO8 with a single button that opens the
 * AddPropertyModal. The Exposé tab inside that modal still uses the
 * same createPropertyFromExpose API call — only the entry point UX
 * changes.
 *
 * On successful creation, opens the PropertyAnalysisModal on the new
 * property in Dossier mode (per ADR-010 §"Post-Submit Behaviour").
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Property } from '@/lib/api';
import AddPropertyModal from './AddPropertyModal';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

export default function AddPropertyButton() {
  const t = useTranslations('addProperty');
  const [modalOpen, setModalOpen] = useState(false);
  const [createdProperty, setCreatedProperty] = useState<Property | null>(null);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-blue-300 transition-colors"
      >
        <span>＋</span>
        <span>{t('button')}</span>
      </button>

      <AddPropertyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(property) => {
          setCreatedProperty(property);
        }}
      />

      {createdProperty && (
        <PropertyAnalysisModal
          property={createdProperty}
          onClose={() => setCreatedProperty(null)}
        />
      )}
    </>
  );
}
