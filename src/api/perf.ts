import axios from 'axios';
import { Algorithm } from '../models.ts';

export async function getParsedAlgorithm(name: string): Promise<Algorithm> {
  const response = await axios.get<Algorithm>(`/api/logs/${encodeURIComponent(name)}/parsed`);
  return response.data;
}

export async function getPerfChartData<T>(
  name: string,
  chartType: string,
  params: Record<string, string | number | null | undefined>,
): Promise<T> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });
  const suffix = searchParams.toString();
  const response = await axios.get<T>(
    `/api/logs/${encodeURIComponent(name)}/charts/${encodeURIComponent(chartType)}${suffix ? `?${suffix}` : ''}`,
  );
  return response.data;
}
