// lib/nestzone.js

const BASE_URL = process.env.NEXT_PUBLIC_API_URL + process.env.NEXT_PUBLIC_BASE_URL_PREFIX;

// --- AUTH APIs ---
export async function registerUser(data) {
  const res = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function loginUser(username, password) {
  const res = await fetch(`${BASE_URL}/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

export async function getUserInfo() {
  const res = await fetch(`${BASE_URL}/person/info`);
  return res.json();
}

export async function logoutUser() {
  const res = await fetch(`${BASE_URL}/logout`, { method: 'POST' });
  return res.json();
}

// --- PROPERTY APIs ---
export async function searchProperties(filter) {
  const res = await fetch(`${BASE_URL}/properties/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filter)
  });
  if (!res.ok) throw new Error('Property fetch failed');
  return res.json();
}

export async function searchUserProperties(filter) {
  const res = await fetch(`${BASE_URL}/properties/filter/user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filter)
  });
  return res.json();
}

export async function getPropertyById(id) {
  const res = await fetch(`${BASE_URL}/properties/getOne?id=${id}`);
  return res.json();
}

export async function bookmarkProperty(data) {
  const res = await fetch(`${BASE_URL}/properties/bookmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function deleteProperty(id) {
  const res = await fetch(`${BASE_URL}/properties?id=${id}`, { method: 'DELETE' });
  return res.json();
}

// --- LOCATION AUTOCOMPLETE ---
export async function searchCities(term) {
  const res = await fetch(`${BASE_URL}/location?searchTerm=${encodeURIComponent(term)}`);
  return res.json();
}



// const API_BASE = process.env.NEXT_PUBLIC_API_URL;
// export async function loginUser(email, password) {
//   const res = await fetch(`${API_BASE}/authenticate`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ email, password }),
//   });
//   return res.json();
// }
// export async function registerUser(data) {
//   const res = await fetch(`${API_BASE}/register`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(data),
//   });
//   return res.json();
// }
// export async function searchProperties(filter) {
//   const res = await fetch(`${API_BASE}/properties/filter`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(filter),
//   });
//   return res.json();
// }
