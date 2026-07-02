export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Only POST allowed" });
    }

    try {
        const { input, filter, seenMovies } = req.body || {};

        const selectedFilter =
            filter === "tv" || filter === "movie" ? filter : "all";

        let finalInput = input;

        if (!finalInput || !finalInput.trim()) {
            finalInput = "top rated movies and tv shows";
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        const OMDB_API_KEY = process.env.OMDB_API_KEY;

        if (!GEMINI_API_KEY || !TMDB_API_KEY || !OMDB_API_KEY) {
            return res.status(500).json({ error: "Missing environment variables" });
        }

        // Hardkodet modell siden valg fra frontend er fjernet
        // Hvis du senere vil bytte modell, gjør det kun her:
        const GEMINI_MODEL = "gemini-3.1-flash-lite";

        const ALLOWED_PROVIDER_NAMES = [
            "Netflix",
            "Disney Plus",
            "Disney+",
            "HBO Max",
            "Max",
            "Viaplay",
            "TV 2 Play",
            "TV2 Play",
            "Amazon Prime Video",
            "Prime Video",
            "Apple TV Plus",
            "Apple TV+"
        ];

        const extractJSON = (text) => {
            if (!text) return null;

            const start = text.indexOf("[");
            const end = text.lastIndexOf("]");

            if (start !== -1 && end !== -1 && end > start) {
                return text.substring(start, end + 1);
            }

            return null;
        };

        const pickRating = (ratings, sourceName) => {
            if (!ratings || !Array.isArray(ratings)) return null;
            const found = ratings.find((r) => r.Source === sourceName);
            return found ? found.Value : null;
        };

        const cleanValue = (value) => {
            if (!value || value === "N/A") return null;
            return value;
        };

        const getPosterUrl = (path) => {
            if (!path) return "";
            return `https://image.tmdb.org/t/p/w500${path}`;
        };

        const getJustWatchSearchUrl = (title) => {
            return `https://www.justwatch.com/no/sok?q=${encodeURIComponent(title)}`;
        };

        const getTMDBExternalIds = async (type, tmdbId) => {
            try {
                const response = await fetch(
                    `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
                );

                if (!response.ok) {
                    console.error("TMDB external_ids failed:", response.status);
                    return {};
                }

                return await response.json();
            } catch (err) {
                console.error("TMDB external_ids error:", err);
                return {};
            }
        };

        const getOMDbRatings = async ({ imdbId, title, year }) => {
            try {
                let url = "";

                if (imdbId) {
                    url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${imdbId}`;
                } else {
                    url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(
                        title
                    )}${year ? `&y=${year}` : ""}`;
                }

                const response = await fetch(url);

                if (!response.ok) {
                    console.error("OMDb failed:", response.status);
                    return {};
                }

                return await response.json();
            } catch (err) {
                console.error("OMDb error:", err);
                return {};
            }
        };

        const getWatchProviders = async (type, id) => {
            try {
                const response = await fetch(
                    `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${TMDB_API_KEY}`
                );

                if (!response.ok) {
                    console.error("TMDB watch providers failed:", response.status);
                    return {
                        type: null,
                        providers: []
                    };
                }

                const data = await response.json();
                const norway = data?.results?.NO;

                if (!norway) {
                    return {
                        type: null,
                        providers: []
                    };
                }

                const flatrate = norway.flatrate || [];
                const rent = norway.rent || [];
                const buy = norway.buy || [];

                let chosenType = null;
                let chosenProviders = [];

                if (flatrate.length > 0) {
                    chosenType = "stream";
                    chosenProviders = flatrate;
                } else if (rent.length > 0) {
                    chosenType = "rent";
                    chosenProviders = rent;
                } else if (buy.length > 0) {
                    chosenType = "buy";
                    chosenProviders = buy;
                }

                const filtered = chosenProviders.filter((p) =>
                    ALLOWED_PROVIDER_NAMES.includes(p.provider_name)
                );

                const providersToUse = filtered.length > 0 ? filtered : chosenProviders;

                const unique = Array.from(
                    new Map(providersToUse.map((p) => [p.provider_id, p])).values()
                );

                return {
                    type: chosenType,
                    providers: unique.slice(0, 4)
                };
            } catch (err) {
                console.error("Watch providers error:", err);
                return {
                    type: null,
                    providers: []
                };
            }
        };

        // Brukes for AI-forslag: velger én beste match
        const searchTMDBMedia = async (title, year, filter) => {
            try {
                const [movieRes, tvRes] = await Promise.all([
                    fetch(
                        `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                            title
                        )}${year ? `&year=${year}` : ""}`
                    ),
                    fetch(
                        `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                            title
                        )}`
                    )
                ]);

                const movieData = movieRes.ok ? await movieRes.json() : {};
                const tvData = tvRes.ok ? await tvRes.json() : {};

                const movie = movieData.results?.[0] || null;
                const tv = tvData.results?.[0] || null;

                // Respekter brukerens valg først
                if (filter === "tv") {
                    if (tv) return { type: "tv", data: tv };
                    return null;
                }

                if (filter === "movie") {
                    if (movie) return { type: "movie", data: movie };
                    return null;
                }

                // Hvis "all": velg beste match
                if (tv && tv.vote_count > (movie?.vote_count || 0)) {
                    return { type: "tv", data: tv };
                }

                if (movie) {
                    return { type: "movie", data: movie };
                }

                return tv ? { type: "tv", data: tv } : null;
            } catch (err) {
                console.error("searchTMDBMedia error:", err);
                return null;
            }
        };

        // Brukes kun for direkte søk på input: hent både film og serie hvis de finnes
        const searchTMDBDirectBoth = async (title) => {
            try {
                const [movieRes, tvRes] = await Promise.all([
                    fetch(
                        `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                            title
                        )}`
                    ),
                    fetch(
                        `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                            title
                        )}`
                    )
                ]);

                const movieData = movieRes.ok ? await movieRes.json() : {};
                const tvData = tvRes.ok ? await tvRes.json() : {};

                return {
                    movie: movieData.results?.[0] || null,
                    tv: tvData.results?.[0] || null
                };
            } catch (err) {
                console.error("searchTMDBDirectBoth error:", err);
                return {
                    movie: null,
                    tv: null
                };
            }
        };

        const buildEnrichedItem = async (
            tmdbItem,
            mediaType,
            fallbackDescription = ""
        ) => {
            const externalIds = await getTMDBExternalIds(mediaType, tmdbItem.id);
            const imdbId = externalIds?.imdb_id;

            const titleForOmdb = mediaType === "tv" ? tmdbItem.name : tmdbItem.title;

            const yearForOmdb =
                mediaType === "tv"
                    ? tmdbItem.first_air_date?.split("-")[0]
                    : tmdbItem.release_date?.split("-")[0];

            const omdb = await getOMDbRatings({
                imdbId,
                title: titleForOmdb,
                year: yearForOmdb
            });

            const watchData = await getWatchProviders(mediaType, tmdbItem.id);

            return {
                mediaType,
                title: titleForOmdb,
                description:
                    fallbackDescription ||
                    tmdbItem.overview ||
                    "Ingen beskrivelse tilgjengelig.",
                poster: getPosterUrl(tmdbItem.poster_path),
                year: yearForOmdb || "",
                tmdbScore:
                    typeof tmdbItem.vote_average === "number"
                        ? tmdbItem.vote_average
                        : null,
                imdbScore: cleanValue(omdb?.imdbRating),
                rottenTomatoes: cleanValue(
                    pickRating(omdb?.Ratings, "Rotten Tomatoes")
                ),
                providerType: watchData.type,
                providers: watchData.providers,
                justWatchUrl: getJustWatchSearchUrl(titleForOmdb)
            };
        };

        // 1. Be Gemini foreslå titler
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    generationConfig: {
                        responseMimeType: "application/json"
                    },
                    contents: [
                        {
                            parts: [
                                {
                                    text: `
Du er en filmassistent.

Brukerens input:
"${finalInput}"

${
  seenMovies && seenMovies.length > 0
    ? `Filmer/serier som bruker allerede har sett (UNNGÅ DISSE):
${seenMovies.map(id => `- ${id.split('|')[0]}`).join('\n')}

`
    : ""
}Oppgave:
1. Hvis input er en spesifikk film eller TV-serie:
   - inkluder den eksakte tittelen som første resultat
   - gi deretter 4 lignende filmer/serier

2. Hvis input er en generell beskrivelse:
   - gi 5 relevante forslag basert på ønsket

Gi meg 5 ${
                                        selectedFilter === "tv"
                                            ? "TV-serier"
                                            : selectedFilter === "movie"
                                                ? "filmer"
                                                : "filmer eller TV-serier"
                                    }.

Regler:
- Hvis TV-serier er valgt: foreslå KUN serier
- Hvis filmer er valgt: foreslå KUN filmer
- Første resultat skal være brukerens input hvis det er en kjent film/serie
- Svar KUN med gyldig JSON-array
- Ingen markdown
- Ingen introtekst
- Ingen code fences
- Ingen spoilers
- Beskrivelsene skal være korte og generelle

Format:
[
  {
    "title": "Tittel",
    "description": "Kort beskrivelse uten spoilers"
  }
]
`
                                }
                            ]
                        }
                    ]
                })
            }
        );

        const rawGeminiText = await geminiResponse.text();

        if (!geminiResponse.ok) {
            console.error("Gemini HTTP error:", geminiResponse.status, rawGeminiText);
            return res.status(500).json({
                error: `Gemini HTTP ${geminiResponse.status}`,
                details: rawGeminiText
            });
        }

        let geminiData;

        try {
            geminiData = JSON.parse(rawGeminiText);
        } catch (err) {
            console.error("Gemini returned invalid outer JSON:", rawGeminiText);
            return res.status(500).json({
                error: "Gemini did not return valid JSON",
                details: rawGeminiText
            });
        }

        const text =
            geminiData?.candidates?.[0]?.content?.parts
                ?.map((part) => part.text || "")
                .join("")
                .trim() || "";

        if (!text) {
            console.error("Unexpected Gemini response:", geminiData);
            return res.status(500).json({
                error: "Gemini response had no text",
                details: geminiData
            });
        }

        let aiItems = [];

        try {
            // Først prøv direkte parse
            aiItems = JSON.parse(text);
        } catch (err) {
            // Fallback hvis modellen likevel pakker inn tekst rundt JSON
            const jsonText = extractJSON(text);

            if (!jsonText) {
                console.error("Could not extract JSON from Gemini text:", text);
                return res.status(500).json({
                    error: "Could not parse AI response",
                    details: text
                });
            }

            try {
                aiItems = JSON.parse(jsonText);
            } catch (parseErr) {
                console.error("Could not parse extracted JSON:", jsonText);
                return res.status(500).json({
                    error: "Could not parse JSON from AI",
                    details: jsonText
                });
            }
        }

        if (!Array.isArray(aiItems)) {
            return res.status(500).json({
                error: "AI response was not an array",
                details: aiItems
            });
        }

        // Rydd litt i respons
        aiItems = aiItems
            .filter((item) => item && typeof item.title === "string" && item.title.trim())
            .slice(0, 5);

        // 2. Berik med TMDB + OMDb + providers (én beste match per AI-forslag)
        let enrichedResults = await Promise.all(
            aiItems.map(async (item) => {
                const fallback = {
                    mediaType:
                        selectedFilter === "tv"
                            ? "tv"
                            : selectedFilter === "movie"
                                ? "movie"
                                : null,
                    title: item.title,
                    description: item.description || "Ingen beskrivelse tilgjengelig.",
                    poster: "",
                    year: item.year || "",
                    tmdbScore: null,
                    imdbScore: null,
                    rottenTomatoes: null,
                    providerType: null,
                    providers: [],
                    justWatchUrl: getJustWatchSearchUrl(item.title)
                };

                try {
                    const tmdbResult = await searchTMDBMedia(
                        item.title,
                        item.year,
                        selectedFilter
                    );

                    if (!tmdbResult) {
                        return fallback;
                    }

                    return await buildEnrichedItem(
                        tmdbResult.data,
                        tmdbResult.type,
                        item.description
                    );
                } catch (err) {
                    console.error("Failed to enrich item:", item.title, err);
                    return fallback;
                }
            })
        );

        // 3. Hvis bruker skrev en spesifikk tittel: legg til både film og serie hvis de finnes
        if (input && input.trim().length < 50) {
            try {
                const directMatches = await searchTMDBDirectBoth(input.trim());

                const itemsToAdd = [];

                if (selectedFilter !== "tv" && directMatches.movie) {
                    itemsToAdd.push({
                        type: "movie",
                        data: directMatches.movie
                    });
                }

                if (selectedFilter !== "movie" && directMatches.tv) {
                    itemsToAdd.push({
                        type: "tv",
                        data: directMatches.tv
                    });
                }

                for (const entry of itemsToAdd.reverse()) {
                    const tmdbItem = entry.data;
                    const mediaType = entry.type;

                    const title =
                        mediaType === "tv" ? tmdbItem.name : tmdbItem.title;

                    const exists = enrichedResults.some(
                        (m) =>
                            m.title &&
                            m.mediaType === mediaType &&
                            m.title.toLowerCase() === title.toLowerCase()
                    );

                    if (!exists) {
                        const enrichedDirect = await buildEnrichedItem(
                            tmdbItem,
                            mediaType,
                            tmdbItem.overview || "Ingen beskrivelse"
                        );

                        enrichedResults.unshift(enrichedDirect);
                    }
                }
            } catch (err) {
                console.error("Direct match failed:", err);
            }
        }

        return res.status(200).json(enrichedResults);
    } catch (error) {
        console.error("FULL ERROR:", error);
        return res.status(500).json({
            error: error.message || "Something went wrong"
        });
    }
}