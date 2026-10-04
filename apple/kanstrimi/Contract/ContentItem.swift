import Foundation

/// What a content card draws, written by the server: the app lays it out and decides nothing. A list item;
/// the sheet stays a `Card`. Texts are final: `facts` « 2019 · ★ 8.5 », « 3 films »; `quality` « 4K DV »
/// alone; `badges` « 4K DV », « FR », « VOSTF », in order; `caption` « 1 h 08 restantes ». `progress` (0…1) only while resumable.
nonisolated struct ContentItem: Codable, Hashable, Identifiable, Sendable {
    /// Where a click goes: the sheet, the saga, the player.
    enum Kind: String, Codable, Sendable {
        case movie, series, episode, live, saga

        /// A kind this app does not know yet reads as a movie: one card must not fail a whole screen.
        init(from decoder: Decoder) throws {
            self = Kind(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .movie
        }

        /// The kind of what plays; nil for a saga, which does not.
        var content: ContentKind? {
            switch self {
            case .movie: .movie
            case .series: .series
            case .episode: .episode
            case .live: .live
            case .saga: nil
            }
        }
    }

    let id: ContentID
    let kind: Kind
    let title: String
    let logo: URL?
    let poster: URL?
    let picture: URL?
    let facts: String?
    /// The quality badge alone, the one `badges` starts with; nil when unknown.
    let quality: String?
    let badges: [String]
    let hint: String?
    let progress: Double?
    let watched: Bool
    let caption: String?
    /// Where the card tells it: the best search result, the carousel, « À suivre »; nil in the lists.
    let overview: String?

    init(id: ContentID, kind: Kind, title: String, logo: URL? = nil, poster: URL? = nil, picture: URL? = nil, facts: String? = nil,
         quality: String? = nil, badges: [String] = [], hint: String? = nil, progress: Double? = nil, watched: Bool = false, caption: String? = nil,
         overview: String? = nil) {
        self.id = id; self.kind = kind; self.title = title; self.logo = logo; self.poster = poster; self.picture = picture
        self.facts = facts; self.quality = quality; self.badges = badges; self.hint = hint; self.progress = progress; self.watched = watched; self.caption = caption
        self.overview = overview
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(ContentID.self, forKey: .id)
        kind = try c.decode(Kind.self, forKey: .kind)
        title = try c.decode(String.self, forKey: .title)
        logo = try c.decodeIfPresent(URL.self, forKey: .logo)
        poster = try c.decodeIfPresent(URL.self, forKey: .poster)
        picture = try c.decodeIfPresent(URL.self, forKey: .picture)
        facts = try c.decodeIfPresent(String.self, forKey: .facts)
        quality = try c.decodeIfPresent(String.self, forKey: .quality)
        badges = try c.decodeIfPresent([String].self, forKey: .badges) ?? []
        hint = try c.decodeIfPresent(String.self, forKey: .hint)
        progress = try c.decodeIfPresent(Double.self, forKey: .progress)
        watched = try c.decodeIfPresent(Bool.self, forKey: .watched) ?? false
        caption = try c.decodeIfPresent(String.self, forKey: .caption)
        overview = try c.decodeIfPresent(String.self, forKey: .overview)
    }
}
