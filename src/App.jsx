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


const getMovieId = (movie) => {
    if (movie.tmdbId) {
        return `tmdb|${movie.tmdbId}|${movie.mediaType}`;
    }
    return `${movie.title}|${movie.year}|${movie.mediaType}`;
};

const idsFromMovies = (movies) => {
    const ids = new Set();
    if (Array.isArray(movies)) {
        movies.forEach(movie => {
            ids.add(getMovieId(movie));
        });
    }
    return ids;
};

const STREAMING_SERVICES = [
    "Netflix", "Disney Plus", "Disney+", "HBO Max", "Max",
    "Viaplay", "TV 2 Play", "TV2 Play", "Amazon Prime Video",
    "Prime Video", "Apple TV Plus", "Apple TV+"
];

export default function App() {
    const [input, setInput] = useState("");
    const [result, setResult] = useState([]);
    const [model, setModel] = useState("gemini-3.1-flash-lite");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("all");
    const [watchedMovies, setWatchedMovies] = useState(new Set());
    const [selectedServices, setSelectedServices] = useState(new Set(STREAMING_SERVICES));
    const [showProviderFilter, setShowProviderFilter] = useState(false);
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [seenMovieIds, setSeenMovieIds] = useState(new Set());
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [lastSearchInput, setLastSearchInput] = useState("");

    useEffect(() => {
        const savedModel = localStorage.getItem("model");
        if (savedModel) {
            setModel(savedModel);
        }
        const savedWatched = localStorage.getItem("watchedMovies");
        if (savedWatched) {
            setWatchedMovies(new Set(JSON.parse(savedWatched)));
        }
        const savedServices = localStorage.getItem("selectedServices");
        if (savedServices) {
            setSelectedServices(new Set(JSON.parse(savedServices)));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("model", model);
    }, [model]);

    useEffect(() => {
        localStorage.setItem("watchedMovies", JSON.stringify(Array.from(watchedMovies)));
    }, [watchedMovies]);

    useEffect(() => {
        localStorage.setItem("selectedServices", JSON.stringify(Array.from(selectedServices)));
    }, [selectedServices]);

    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === "Escape") {
                setSelectedMovie(null);
            }
        };
        if (selectedMovie) {
            window.addEventListener("keydown", handleEscape);
            return () => window.removeEventListener("keydown", handleEscape);
        }
    }, [selectedMovie]);

    const handleWatchedToggle = (movie) => {
        const id = getMovieId(movie);
        const newWatched = new Set(watchedMovies);
        if (newWatched.has(id)) {
            newWatched.delete(id);
        } else {
            newWatched.add(id);
        }
        setWatchedMovies(newWatched);
    };

    const handleServiceToggle = (service, isChecked) => {
        const newServices = new Set(selectedServices);
        if (isChecked) {
            newServices.add(service);
        } else {
            newServices.delete(service);
        }
        setSelectedServices(newServices);
    };

    const handleRandom = async () => {
        setLoading(true);
        setError("");
        setSeenMovieIds(new Set());

        const inputs = [
            "highly rated movies",
            "best imdb movies",
            "top rated films",
            "critically acclaimed tv shows",
            "top rated series"
        ];

        const randomInput = inputs[Math.floor(Math.random() * inputs.length)];
        setLastSearchInput(randomInput);

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

            if (!res.ok) {
                setError(data?.error || "Noe gikk galt ved tilfeldig valg.");
                return;
            }

            // Track all movie IDs from initial search
            if (Array.isArray(data)) {
                setResult(data);
                setSeenMovieIds(idsFromMovies(data));
            } else {
                setError("Uventet svar fra server.");
                setResult([]);
            }
        } catch (err) {
            console.error(err);
            setError("Kunne ikke hente tilfeldige filmer.");
        } finally {
            setLoading(false);
        }
    };

    const handleLoadMore = async () => {
        setIsLoadingMore(true);
        setError("");

        // Use user's last search input, or fallback to generic input
        const searchInput = lastSearchInput || "top rated movies and tv shows";

        try {
            const res = await fetch("/api/recommendations", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    input: searchInput,
                    filter,
                    model: "gemini-3.1-flash-lite",
                    seenMovies: Array.from(seenMovieIds),
                    seenTitles: result.map(m => m.title).filter(Boolean),
                    loadMore: true
                })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data?.error || "Kunne ikke laste flere filmer.");
                return;
            }

            // Filter out any duplicates (frontend safety check)
            if (Array.isArray(data)) {
                const newMovies = data.filter(movie => !seenMovieIds.has(getMovieId(movie)));

                // APPEND new unique movies to existing results
                setResult(prev => [...prev, ...newMovies]);

                // Update seenMovieIds with new movies
                const newIds = new Set(seenMovieIds);
                newMovies.forEach(movie => {
                    newIds.add(getMovieId(movie));
                });
                setSeenMovieIds(newIds);
            } else {
                setError("Uventet svar fra server.");
            }
        } catch (err) {
            console.error(err);
            setError("Nettverksfeil ved lasting av flere filmer.");
        } finally {
            setIsLoadingMore(false);
        }
    };

    const askAI = async () => {
        if (!input.trim()) return;

        setLoading(true);
        setError("");
        setResult([]);
        setLastSearchInput(input);
        setSeenMovieIds(new Set());

        try {
            const res = await fetch("/api/recommendations", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    input,
                    filter,
                    model: "gemini-3.1-flash-lite"
                })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data?.error || "Noe gikk galt.");
                return;
            }

            if (Array.isArray(data)) {
                setResult(data);
                setSeenMovieIds(idsFromMovies(data));
            } else {
                setResult([]);
            }
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

                    {/* Provider Filter Section */}
                    <div className="provider-filter-section">
                        <button
                            type="button"
                            className="provider-filter-toggle"
                            onClick={() => setShowProviderFilter(!showProviderFilter)}
                        >
                            {showProviderFilter ? "▼" : "▶"} Velg strømmingstjenester ({selectedServices.size}/{STREAMING_SERVICES.length})
                        </button>

                        {showProviderFilter && (
                            <div className="provider-list">
                                {STREAMING_SERVICES.map((service) => (
                                    <label key={service} className="provider-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={selectedServices.has(service)}
                                            onChange={(e) => handleServiceToggle(service, e.target.checked)}
                                        />
                                        <span>{service}</span>
                                    </label>
                                ))}
                            </div>
                        )}
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
                            // Type filter
                            if (filter !== "all" && movie.mediaType !== filter) return false;

                            // Provider filter
                            if (movie.providers && movie.providers.length > 0) {
                                const hasSelectedProvider = movie.providers.some((p) =>
                                    selectedServices.has(p.provider_name)
                                );
                                return hasSelectedProvider;
                            }
                            // If no providers found, don't show it
                            return false;
                        })
                        .map((movie) => (
                            <div
                                key={getMovieId(movie)}
                                className={`card ${watchedMovies.has(getMovieId(movie)) ? "watched" : ""}`}
                                onClick={() => setSelectedMovie(movie)}
                                style={{ cursor: "pointer" }}
                            >
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

                                    <label className="watched-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={watchedMovies.has(getMovieId(movie))}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                handleWatchedToggle(movie);
                                            }}
                                        />
                                        <span>Sett</span>
                                    </label>

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

                {/* Load More Button */}
                {result.length > 0 && (
                    <div style={{ textAlign: "center", marginTop: "32px", marginBottom: "32px" }}>
                        <button
                            type="button"
                            className="load-more-button"
                            onClick={handleLoadMore}
                            disabled={isLoadingMore}
                        >
                            {isLoadingMore ? "Laster..." : "Last flere filmer 📺"}
                        </button>
                    </div>
                )}

                {/* Movie Detail Modal */}
                {selectedMovie && (
                    <div
                        className="modal-backdrop"
                        onClick={() => setSelectedMovie(null)}
                    >
                        <div
                            className="modal-content"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                className="modal-close-button"
                                onClick={() => setSelectedMovie(null)}
                            >
                                ✕
                            </button>

                            <div className="modal-poster">
                                {selectedMovie.poster ? (
                                    <img
                                        src={selectedMovie.poster}
                                        alt={selectedMovie.title}
                                    />
                                ) : (
                                    <div className="poster-fallback">Ingen plakat</div>
                                )}
                            </div>

                            <div className="modal-info">
                                <h2>
                                    {selectedMovie.title}
                                    {selectedMovie.year ? ` (${selectedMovie.year})` : ""}
                                </h2>

                                <label className="watched-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={watchedMovies.has(getMovieId(selectedMovie))}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            handleWatchedToggle(selectedMovie);
                                        }}
                                    />
                                    <span>Markert som sett</span>
                                </label>

                                <div className="modal-section">
                                    <h3>Beskrivelse</h3>
                                    <p>{selectedMovie.description}</p>
                                </div>

                                <div className="modal-section">
                                    <h3>Vurderinger</h3>
                                    <div className="modal-ratings">
                                        {selectedMovie.imdbScore && (
                                            <p>IMDb: {selectedMovie.imdbScore}</p>
                                        )}
                                        {selectedMovie.rottenTomatoes && (
                                            <p>Rotten Tomatoes: {selectedMovie.rottenTomatoes}</p>
                                        )}
                                        {selectedMovie.tmdbScore && (
                                            <p>TMDB: {selectedMovie.tmdbScore.toFixed(1)}</p>
                                        )}
                                    </div>
                                </div>

                                {selectedMovie.providers && selectedMovie.providers.length > 0 ? (
                                    <div className="modal-section">
                                        <h3>
                                            {getProviderLabel(selectedMovie.providerType)}
                                        </h3>
                                        <div className="modal-providers">
                                            {selectedMovie.providers.map((p) => (
                                                <div key={p.provider_id} className="modal-provider-item">
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                                                        alt={p.provider_name}
                                                        title={p.provider_name}
                                                    />
                                                    <span>{p.provider_name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="modal-section">
                                        <p className="modal-no-providers">
                                            Ikke funnet på streaming i Norge
                                        </p>
                                        <a
                                            href={selectedMovie.justWatchUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="modal-justwatch-link"
                                        >
                                            Søk hos JustWatch
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}