import { API_BASE_URL } from '../config/api';

export async function getRewardsApi(token) {
  const response = await fetch(`${API_BASE_URL}/rewards`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Erro ao buscar recompensas');
  }

  return result;
}

export async function createRewardApi(token, data) {
  const response = await fetch(`${API_BASE_URL}/rewards`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Erro ao criar recompensa');
  }

  return result;
}