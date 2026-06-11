import { useEffect, useState } from "react";

const MODELS = [
    {
        id: "gemini-3.1-flash-lite",
        label: "⚡ Rask (billig)"
    },
    {
        id: "gemini-3.5-flash",
        label: "⚖️ Balansert"
    },
    {
        id: "gemini-3.1-pro-preview",
        label: "🧠 Best kvalitet"
    }
];

const getProviderLabel = (type) => {
    if (type === "stream") return "Se på";
    if (type === "rent") return "Lei på";
    if (type === "buy") return "Kjøp på";
    return "Tilgjengelig på";
};

export default function App() {
    const [input, setInput] = useState("");
    const [result, setResult] = useState([]);
    const [model, setModel] = useState("gemini-3.1-flash-lite");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        const savedModel = localStorage.getItem("model");
        if (savedModel) {
            setModel(savedModel);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("model", model);
    }, [model]);

    const askAI = async () => {
        if (!input.trim()) return;

        setLoading(true);
        setError("");
        setResult([]);

        try {
            const res = await fetch("/api/recommendations", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    input,
                    filter,
                    model
                })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data?.error || "Noe gikk galt.");
                return;
            }

            setResult(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
            setError("Kunne ikke hente data.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container">
            <h1>🎬 Hva skal jeg se?</h1>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    askAI();
                }}
            >
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Hva har du lyst å se?"
                    autoFocus
                />

                <button type="submit" disabled={loading}>
                    {loading ? "Laster..." : "Finn filmer eller serier"}
                </button>
            </form>

            {/* Modellvalg */}
            <div style={{ marginTop: "12px" }}>
                <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                >
                    {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Filter */}
            <div style={{ marginTop: "10px", marginBottom: "10px" }}>
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                >
                    <option value="all">Alle</option>
                    <option value="movie">🎬 Kun filmer</option>
                    <option value="tv">📺 Kun serier</option>
                </select>
            </div>

            <p
                style={{
                    fontSize: "12px",
                    opacity: 0.7,
                    marginTop: "6px",
                    marginBottom: "16px"
                }}
            >
                Velg hvor kraftig AI du vil bruke
            </p>

            {error && (
                <div
                    style={{
                        background: "#3a1f1f",
                        color: "#ffb4b4",
                        padding: "12px",
                        borderRadius: "10px",
                        marginBottom: "12px"
                    }}
                >
                    {error}
                </div>
            )}

            <div className="results">
                {result
                    .filter((movie) => {
                        if (filter === "all") return true;
                        return movie.mediaType === filter;
                    })
                    .map((movie, index) => (
                        <div key={index} className="card">
                            {movie.poster ? (
                                <img
                                    src={movie.poster}
                                    alt={movie.title}
                                    className="poster"
                                />
                            ) : (
                                <div className="poster poster-fallback">
                                    Ingen plakat
                                </div>
                            )}

                            <div className="card-content">
                                <h3>
                                    {movie.title}
                                    {movie.year ? ` (${movie.year})` : ""}
                                    <span
                                        style={{
                                            marginLeft: "8px",
                                            fontSize: "12px",
                                            opacity: 0.7
                                        }}
                                    >
                                        {movie.mediaType === "tv"
                                            ? "📺 Serie"
                                            : "🎬 Film"}
                                    </span>
                                </h3>

                                <p>{movie.description}</p>

                                <div className="ratings">
                                    {movie.imdbScore && (
                                        <span>IMDb: {movie.imdbScore}</span>
                                    )}
                                    {movie.rottenTomatoes && (
                                        <span>RT: {movie.rottenTomatoes}</span>
                                    )}
                                    {movie.tmdbScore && (
                                        <span>
                                            TMDB:{" "}
                                            {movie.tmdbScore.toFixed(1)}
                                        </span>
                                    )}
                                </div>

                                {movie.providers &&
                                movie.providers.length > 0 ? (
                                    <div className="watch-section">
                                        <p className="watch-label">
                                            {getProviderLabel(
                                                movie.providerType
                                            )}
                                            :
                                        </p>

                                        <div className="providers">
                                            {movie.providers.map((p) => (
                                                <div
                                                    key={p.provider_id}
                                                    className="provider-item"
                                                >
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                                                        alt={p.provider_name}
                                                        title={p.provider_name}
                                                    />
                                                    <span>
                                                        {p.provider_name}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="watch-section">
                                        <p className="watch-label-muted">
                                            Ikke funnet på streaming i Norge
                                        </p>

                                        <a
                                            href={movie.justWatchUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="watch-link"
                                        >
                                            Søk hos JustWatch
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    );
}