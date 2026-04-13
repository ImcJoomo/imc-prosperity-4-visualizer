import axios from 'axios';
import { ResultLog } from '../models';

const API_BASE = '';

export interface SavedLog {
  name: string;
  filename: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
}

export async function listLogs(): Promise<SavedLog[]> {
  const response = await axios.get<SavedLog[]>(`${API_BASE}/api/logs`);
  return response.data;
}

export async function getLog(name: string): Promise<ResultLog> {
  const response = await axios.get<ResultLog>(`${API_BASE}/api/logs/${name}`);
  return response.data;
}

export async function saveLog(name: string, data: ResultLog): Promise<{ name: string; path: string }> {
  const response = await axios.post(`${API_BASE}/api/logs/save`, { name, data });
  return response.data;
}

export async function uploadLogFile(file: File, name?: string): Promise<{ name: string; path: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (name) {
    formData.append('name', name);
  }
  const response = await axios.post(`${API_BASE}/api/logs/upload`, formData);
  return response.data;
}

export async function deleteLog(name: string): Promise<void> {
  await axios.delete(`${API_BASE}/api/logs/${name}`);
}
