import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Eyebrow, EditorialH1, NumberedSection, BigFigure, PillButton, StepIndicator } from './editorial';

test('editorial primitives render their content', () => {
  render(
    <NumberedSection n="01" title="Veldu flokka" lede="Lede texti">
      <Eyebrow>Ný herferð</Eyebrow>
      <EditorialH1>Stofna herferð</EditorialH1>
      <BigFigure value="50.000" suffix="kr." />
      <PillButton active>25.000 kr.</PillButton>
      <StepIndicator steps={['Flokkar', 'Fjárhæð', 'Greiðsla']} current={0} />
    </NumberedSection>,
  );
  expect(screen.getByText('Veldu flokka')).toBeDefined();
  expect(screen.getByText('Stofna herferð')).toBeDefined();
  expect(screen.getByText('50.000')).toBeDefined();
  expect(screen.getByText('25.000 kr.')).toBeDefined();
  expect(screen.getByText('Fjárhæð')).toBeDefined();
});
