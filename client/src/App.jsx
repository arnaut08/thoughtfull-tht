import { useEffect, useState } from "react";

function App() {
  const [apiStatus, setApiStatus] = useState("Loading...");

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "/api";

    fetch(`${apiUrl}/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        return response.json();
      })
      .then((data) => setApiStatus(data.status))
      .catch(() => setApiStatus("Unavailable"));
  }, []);

  return (
    <main className="app">
      <p className="eyebrow">React + Express starter</p>
      <h1>Welcome to thoughtfull-tht</h1>
      <p className="description">
        Your client and server are ready for you to build on.
      </p>
      <p className="status">
        API status: <strong>{apiStatus}</strong>
      </p>
    </main>
  );
}

export default App;
