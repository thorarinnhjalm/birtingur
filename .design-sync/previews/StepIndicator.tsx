import { StepIndicator } from '@ada/dashboard';

export const BuyFlow = () => (
  <StepIndicator steps={['Flokkar', 'Fjárhæð', 'Greiðsla']} current={1} />
);

export const Onboarding = () => (
  <StepIndicator steps={['Vefurinn þinn', 'Flokkar og pláss']} current={0} />
);
