import { fireEvent, render, waitFor } from '@testing-library/react-native';

import App from '../App';

jest.mock('../src/api/courseBackend', () => ({
  getBackendHealth: jest.fn().mockResolvedValue({
    ok: true,
    service: 'dmi-controlled-backend',
    contractVersion: 1,
  }),
}));

test('shows incident list and opens a deterministic detail', async () => {
  const view = await render(<App />);

  await waitFor(() => expect(view.getByText('Lista de incidencias')).toBeTruthy());
  const rows = await view.findAllByRole('button');
  fireEvent.press(rows[2]!);

  await waitFor(() => expect(view.getByText('Estado: Abierta')).toBeTruthy());
  expect(view.getByText('Detalle')).toBeTruthy();
  expect(view.getByText('Ubicacion: Biblioteca, planta alta')).toBeTruthy();
});
