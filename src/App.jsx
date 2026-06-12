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

    const handleRandom = async () => {
        setLoading(true);

        const inputs = [
            "highly rated movies",
            "best imdb movies",
            "top rated films",
            "critically acclaimed tv shows",
            "top rated series"
        ];

        const randomInput = inputs[Math.floor(Math.random() * inputs.length)];

        try {
            const res = await fetch("/api/recommendations", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    input: randomInput,
                    filter,
                    model: "gemini-3.1-flash-lite"
                })
            });

            const data = await res.json();
            setResult(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

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

        <div className={`container ${result.length === 0 ? "empty" : ""}`}>
            <div className="content">

                <h1>🎬 Hva skal jeg se?</h1>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        askAI();
                    }}
                >
                    {/* 1. Det store tekstfeltet */}
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Hva har du lyst å se?"
                        autoFocus
                    />

                    {/* 2. NYTT: Filter-chips (Lagt flatt rett under tekstfeltet) */}
                    <div className="filter-group">
                        <label className="checkbox-container">
                            <input
                                type="radio"
                                name="mediaFilter"
                                value="all"
                                checked={filter === "all"}
                                onChange={(e) => setFilter(e.target.value)}
                            />
                            <span className="checkmark">Alle</span>
                        </label>

                        <label className="checkbox-container">
                            <input
                                type="radio"
                                name="mediaFilter"
                                value="movie"
                                checked={filter === "movie"}
                                onChange={(e) => setFilter(e.target.value)}
                            />
                            <span className="checkmark">Filmer</span>
                        </label>

                        <label className="checkbox-container">
                            <input
                                type="radio"
                                name="mediaFilter"
                                value="tv"
                                checked={filter === "tv"}
                                onChange={(e) => setFilter(e.target.value)}
                            />
                            <span className="checkmark">Serier</span>
                        </label>
                    </div>

                    {/* 3. Hovedknappene */}
                    <button type="submit" disabled={loading}>
                        {loading ? "Laster..." : "Finn filmer eller serier"}
                    </button>

                    <button type="button" className="btn-primary" onClick={handleRandom}>
                        Gi meg noe bra 🎬
                    </button>
                </form>

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

                {/* Resultatvisning */}
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

                                    {movie.providers && movie.providers.length > 0 ? (
                                        <div className="watch-section">
                                            <p className="watch-label">
                                                {getProviderLabel(movie.providerType)}:
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
        </div>
    );
}