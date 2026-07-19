import { pipeline } from '@huggingface/transformers';
import { logger } from './logger';

let extractorPromise: any = null;

async function getExtractor(): Promise<any> {
    if (!extractorPromise) {
        logger.log('Initializing client-side ONNX embedding model (Xenova/all-MiniLM-L6-v2)...');
        // Disable local model lookups to fetch model ONNX files from Hugging Face hub on first run
        extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return extractorPromise;
}

const embeddingCache = new Map<string, number[]>();

/**
 * Generates a 384-dimensional semantic embedding vector for a given word.
 * Utilizes a local cache to avoid redundant model executions.
 */
export async function getEmbedding(word: string): Promise<number[]> {
    const cleanWord = word.trim().toLowerCase();
    if (embeddingCache.has(cleanWord)) {
        return embeddingCache.get(cleanWord)!;
    }

    try {
        const extractor = await getExtractor();
        // Generate feature tensor with mean-pooling and L2 normalization
        const output = await extractor(cleanWord, { pooling: 'mean', normalize: true });
        
        // Convert ONNX float32 array data to JavaScript array
        const vector = Array.from(output.data as Float32Array);
        embeddingCache.set(cleanWord, vector);
        return vector;
    } catch (error) {
        logger.error('Failed to generate embedding for word:', word, error);
        // Return fallback 384-dim zero-vector on failure
        return new Array(384).fill(0);
    }
}

/**
 * Computes the cosine similarity between two numeric vectors.
 * Returns a value between -1.0 and 1.0 (where 1.0 means identical semantics).
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) {
        return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) {
        return 0;
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const candidateWords = [
    "water", "fire", "ice", "steam", "earth", "wind", "stone", "sand", "forest", "desert", "tree", "cactus", "river", "ocean", "fish", "bird", "cloud", "rain", "sun", "moon", "star", "night", "day", "light", "dark", "king", "queen", "man", "woman", "prince", "princess", "boy", "girl", "father", "mother", "brother", "sister", "city", "village", "house", "palace", "street", "road", "car", "boat", "plane", "train", "wheel", "metal", "wood", "glass", "paper", "book", "pen", "pencil", "write", "read", "speak", "hear", "see", "think", "love", "hate", "fear", "anger", "joy", "sadness", "happy", "sad", "good", "bad", "hot", "cold", "warm", "cool", "fast", "slow", "high", "low", "big", "small", "animal", "plant", "flower", "grass", "leaf", "root", "seed", "fruit", "food", "drink", "bread", "meat", "milk", "cheese", "wine", "beer", "cup", "plate", "knife", "fork", "spoon", "table", "chair", "bed", "door", "window", "wall", "roof", "floor", "key", "lock", "gold", "silver", "iron", "copper", "bronze", "money", "coin", "buy", "sell", "shop", "market", "work", "play", "run", "walk", "jump", "swim", "fly", "sleep", "wake", "eat", "drink", "cook", "bake", "clean", "wash", "dirty", "dry", "wet", "soft", "hard", "heavy", "light", "strong", "weak", "rich", "poor", "young", "old", "new", "safe", "danger", "health", "sickness", "doctor", "nurse", "hospital", "medicine", "pill", "cure", "heal", "die", "live", "birth", "death", "life", "time", "clock", "watch", "calendar", "year", "month", "week", "hour", "minute", "second", "history", "future", "past", "space", "sky", "planet", "galaxy", "universe", "alien", "rocket", "astronaut", "science", "art", "music", "sport", "game", "toy", "doll", "ball", "card", "dice", "win", "lose", "score", "point", "player", "team", "coach", "audience", "theater", "movie", "actor", "actress", "camera", "photo", "picture", "paint", "draw", "sculpt", "create", "make", "destroy", "build", "bridge", "tower", "castle", "temple", "church", "god", "angel", "demon", "spirit", "ghost", "soul", "mind", "brain", "body", "head", "face", "eye", "ear", "nose", "mouth", "tooth", "tongue", "hair", "neck", "shoulder", "arm", "hand", "finger", "leg", "foot", "toe", "heart", "lung", "liver", "stomach", "bone", "blood", "skin", "muscle", "healthy", "sick", "pain", "pleasure", "warmth", "chill", "summer", "winter", "spring", "autumn", "fall", "season", "weather", "storm", "thunder", "lightning", "snow", "breeze", "hurricane", "tornado", "disaster", "hazard", "threat", "risk", "shield", "sword", "bow", "arrow", "spear", "armor", "helmet", "soldier", "warrior", "knight", "general", "emperor", "president", "leader", "chief", "boss", "manager", "police", "guard", "prison", "court", "judge", "law", "rule", "order", "chaos", "peace", "war", "battle", "fight", "conflict", "clash", "safety", "refuge", "home", "family", "friend", "enemy", "ally", "rival", "partner", "spouse", "husband", "wife", "child", "son", "daughter", "parent", "grandparent", "ancestor", "descendant", "heir", "heritage", "legacy"
];

/**
 * Solves the semantic word analogy: A is to B as C is to D.
 * Computes Target = B - A + C and finds the closest word D in candidateWords.
 */
export async function findClosestAnalogy(
    wordA: string,
    wordB: string,
    wordC: string
): Promise<{ word: string; similarity: number }> {
    const vecA = await getEmbedding(wordA);
    const vecB = await getEmbedding(wordB);
    const vecC = await getEmbedding(wordC);

    const length = vecA.length;
    const targetVec = new Array(length).fill(0);
    for (let i = 0; i < length; i++) {
        targetVec[i] = vecB[i] - vecA[i] + vecC[i];
    }

    const exclude = new Set([
        wordA.toLowerCase().trim(),
        wordB.toLowerCase().trim(),
        wordC.toLowerCase().trim()
    ]);

    let bestWord = "discovery";
    let bestSim = -1;

    for (const word of candidateWords) {
        const cleanWord = word.toLowerCase().trim();
        if (exclude.has(cleanWord)) continue;

        const vecWord = await getEmbedding(cleanWord);
        const sim = cosineSimilarity(targetVec, vecWord);
        if (sim > bestSim) {
            bestSim = sim;
            bestWord = cleanWord;
        }
    }

    return { word: bestWord, similarity: bestSim };
}
