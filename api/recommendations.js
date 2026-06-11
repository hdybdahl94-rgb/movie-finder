export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Only POST allowed" });
    }

    try {
        const { input, filter, model } = req.body;


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

            if (start !== -1 && end !== -1) {
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
            const response = await fetch(
                `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
            );
            return response.json();
        };

        const getOMDbRatings = async ({ imdbId, title, year }) => {
            let url = "";

            if (imdbId) {
                url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${imdbId}`;
            } else {
                url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(
                    title
                )}${year ? `&y=${year}` : ""}`;
            }

            const response = await fetch(url);
            return response.json();
        };

        const getWatchProviders = async (type, id) => {
            const response = await fetch(
                `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${TMDB_API_KEY}`
            );

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
        };

        // Brukes for AI-forslag: velger én beste match
        const searchTMDBMedia = async (title, year, filter) => {
            const movieRes = await fetch(
                `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                    title
                )}${year ? `&year=${year}` : ""}`
            );
            const movieData = await movieRes.json();

            const tvRes = await fetch(
                `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                    title
                )}`
            );
            const tvData = await tvRes.json();

            const movie = movieData.results?.[0];
            const tv = tvData.results?.[0];

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
        };

        // Brukes kun for direkte søk på input: hent både film og serie hvis de finnes
        const searchTMDBDirectBoth = async (title) => {
            const movieRes = await fetch(
                `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                    title
                )}`
            );
            const movieData = await movieRes.json();

            const tvRes = await fetch(
                `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                    title
                )}`
            );
            const tvData = await tvRes.json();

            return {
                movie: movieData.results?.[0] || null,
                tv: tvData.results?.[0] || null
            };
        };

        const buildEnrichedItem = async (tmdbItem, mediaType, fallbackDescription = "") => {
            const externalIds = await getTMDBExternalIds(mediaType, tmdbItem.id);
            const imdbId = externalIds?.imdb_id;

            const titleForOmdb =
                mediaType === "tv" ? tmdbItem.name : tmdbItem.title;

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
            `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-3.1-flash-lite"
            }:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: `
Du er en filmassistent.

Brukerens input:
"${finalInput}"

Oppgave:
1. Hvis input er en spesifikk film eller TV-serie:
   - inkluder den eksakte tittelen som første resultat
   - gi deretter 4 lignende filmer/serier

2. Hvis input er en generell beskrivelse:
   - gi 5 relevante forslag basert på ønsket

Gi meg 5 ${filter === "tv"
                                            ? "TV-serier"
                                            : filter === "movie"
                                                ? "filmer"
                                                : "filmer eller TV-serier"
                                        }.

Regler:
- Hvis TV-serier er valgt: foreslå KUN serier
- Hvis filmer er valgt: foreslå KUN filmer
- Første resultat skal være brukerens input hvis det er en kjent film/serie
- Svar KUN med gyldig JSON
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

        const geminiData = await geminiResponse.json();
        const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonText = extractJSON(text);

        if (!jsonText) {
            return res.status(500).json({ error: "Could not parse AI response" });
        }

        let aiItems = [];

        try {
            aiItems = JSON.parse(jsonText);
        } catch (err) {
            return res.status(500).json({ error: "Could not parse JSON from AI" });
        }

        // 2. Berik med TMDB + OMDb + providers (én beste match per AI-forslag)
        let enrichedResults = await Promise.all(
            aiItems.map(async (item) => {
                const fallback = {
                    mediaType:
                        filter === "tv"
                            ? "tv"
                            : filter === "movie"
                                ? "movie"
                                : null,
                    title: item.title,
                    description: item.description,
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
                        filter
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
                const directMatches = await searchTMDBDirectBoth(input.trim);

                const itemsToAdd = [];

                if (filter !== "tv" && directMatches.movie) {
                    itemsToAdd.push({
                        type: "movie",
                        data: directMatches.movie
                    });
                }

                if (filter !== "movie" && directMatches.tv) {
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