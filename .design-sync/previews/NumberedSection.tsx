import { NumberedSection, PillButton } from '@ada/dashboard';

// The buy-flow's numbered-section idiom: numeral + title + lede, content below.
export const BudgetSection = () => (
  <div style={{ maxWidth: 640 }}>
    <NumberedSection
      n="02"
      title="Fjárhæð"
      lede="Þú borgar aldrei meira. Herferðin stöðvast sjálfkrafa þegar fjárhæðinni er náð."
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <PillButton>25.000 kr.</PillButton>
        <PillButton active>50.000 kr.</PillButton>
        <PillButton>100.000 kr.</PillButton>
      </div>
    </NumberedSection>
  </div>
);
