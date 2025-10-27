//
//  Series.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Modèles de réponse API Xtream pour Series
//

import Foundation

// MARK: - Series Categories & Info

struct SeriesCategoryResponse: Codable {
    let categoryId: String
    let categoryName: String
    let parentId: Int?

    enum CodingKeys: String, CodingKey {
        case categoryId = "category_id"
        case categoryName = "category_name"
        case parentId = "parent_id"
    }
}

struct SeriesResponse: Codable {
    let num: Int?
    let name: String
    let title: String?
    let year: String?
    let seriesId: Int
    let cover: String?
    let plot: String?
    let cast: String?
    let director: String?
    let genre: String?
    let releaseDate: String?
    let lastModified: String?
    let rating: String?
    let rating5based: Double?
    let backdropPath: [String]?
    let youtubeTrailer: String?
    let episodeRunTime: String?
    let categoryId: String?
    let categoryName: String?

    enum CodingKeys: String, CodingKey {
        case num
        case name
        case title
        case year
        case seriesId = "series_id"
        case cover
        case plot
        case cast
        case director
        case genre
        case releaseDate = "releaseDate"
        case lastModified = "last_modified"
        case rating
        case rating5based = "rating_5based"
        case backdropPath = "backdrop_path"
        case youtubeTrailer = "youtube_trailer"
        case episodeRunTime = "episode_run_time"
        case categoryId = "category_id"
        case categoryName = "category_name"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        num = try container.decodeIfPresent(Int.self, forKey: .num)
        name = try container.decode(String.self, forKey: .name)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        year = try container.decodeIfPresent(String.self, forKey: .year)
        seriesId = try container.decode(Int.self, forKey: .seriesId)
        cover = try container.decodeIfPresent(String.self, forKey: .cover)
        plot = try container.decodeIfPresent(String.self, forKey: .plot)
        cast = try container.decodeIfPresent(String.self, forKey: .cast)
        director = try container.decodeIfPresent(String.self, forKey: .director)
        genre = try container.decodeIfPresent(String.self, forKey: .genre)
        releaseDate = try container.decodeIfPresent(String.self, forKey: .releaseDate)
        lastModified = try container.decodeIfPresent(String.self, forKey: .lastModified)
        rating = try container.decodeIfPresent(String.self, forKey: .rating)
        youtubeTrailer = try container.decodeIfPresent(String.self, forKey: .youtubeTrailer)
        episodeRunTime = try container.decodeIfPresent(String.self, forKey: .episodeRunTime)
        categoryId = try container.decodeIfPresent(String.self, forKey: .categoryId)
        categoryName = try container.decodeIfPresent(String.self, forKey: .categoryName)
        rating5based = container.decodeFlexibleDoubleIfPresent(forKey: .rating5based)

        // Décodage flexible pour backdropPath (Array, String ou null)
        if let arrayValue = try? container.decodeIfPresent([String].self, forKey: .backdropPath) {
            backdropPath = arrayValue.filter { !$0.isEmpty }
        } else if let stringValue = try? container.decodeIfPresent(String.self, forKey: .backdropPath),
                  !stringValue.isEmpty {
            backdropPath = [stringValue]
        } else {
            backdropPath = nil
        }
    }
}

struct SeriesInfo: Codable {
    let seasons: [Season]?
    let info: SeriesDetailInfo?
    let episodes: [String: [EpisodeInfo]]?

    enum CodingKeys: String, CodingKey {
        case seasons
        case info
        case episodes
    }
}

struct SeriesDetailInfo: Codable {
    let name: String?
    let cover: String?
    let plot: String?
    let cast: String?
    let director: String?
    let genre: String?
    let releaseDate: String?
    let lastModified: String?
    let rating: String?
    let rating5based: Double?
    let backdropPath: [String]?
    let youtubeTrailer: String?  // TODO it's youtube id like @see serie 42621
    let episodeRunTime: String?
    let categoryId: String?

    enum CodingKeys: String, CodingKey {
        case name
        case cover
        case plot
        case cast
        case director
        case genre
        case releaseDate = "releaseDate"
        case lastModified = "last_modified"
        case rating
        case rating5based = "rating_5based"
        case backdropPath = "backdrop_path"
        case youtubeTrailer = "youtube_trailer"
        case episodeRunTime = "episode_run_time"
        case categoryId = "category_id"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        name = try container.decodeIfPresent(String.self, forKey: .name)
        cover = try container.decodeIfPresent(String.self, forKey: .cover)
        plot = try container.decodeIfPresent(String.self, forKey: .plot)
        cast = try container.decodeIfPresent(String.self, forKey: .cast)
        director = try container.decodeIfPresent(String.self, forKey: .director)
        genre = try container.decodeIfPresent(String.self, forKey: .genre)
        releaseDate = try container.decodeIfPresent(String.self, forKey: .releaseDate)
        lastModified = try container.decodeIfPresent(String.self, forKey: .lastModified)
        rating = try container.decodeIfPresent(String.self, forKey: .rating)
        youtubeTrailer = try container.decodeIfPresent(String.self, forKey: .youtubeTrailer)
        episodeRunTime = try container.decodeIfPresent(String.self, forKey: .episodeRunTime)
        categoryId = try container.decodeIfPresent(String.self, forKey: .categoryId)
        rating5based = container.decodeFlexibleDoubleIfPresent(forKey: .rating5based)

        // Décodage flexible pour backdropPath (Array, String ou null)
        if let arrayValue = try? container.decodeIfPresent([String].self, forKey: .backdropPath) {
            backdropPath = arrayValue.filter { !$0.isEmpty }
        } else if let stringValue = try? container.decodeIfPresent(String.self, forKey: .backdropPath),
                  !stringValue.isEmpty {
            backdropPath = [stringValue]
        } else {
            backdropPath = nil
        }
    }
}

struct Season: Codable {
    let airDate: String?
    let episodeCount: Int?
    let id: Int?
    let name: String?
    let overview: String?
    let seasonNumber: Int
    let coverTmdb: String?

    enum CodingKeys: String, CodingKey {
        case airDate = "air_date"
        case episodeCount = "episode_count"
        case id
        case name
        case overview
        case seasonNumber = "season_number"
        case coverTmdb = "cover_tmdb"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        airDate = try container.decodeIfPresent(String.self, forKey: .airDate)
        episodeCount = container.decodeFlexibleIntIfPresent(forKey: .episodeCount)
        id = try container.decodeIfPresent(Int.self, forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        overview = try container.decodeIfPresent(String.self, forKey: .overview)
        seasonNumber = try container.decode(Int.self, forKey: .seasonNumber)
        coverTmdb = try container.decodeIfPresent(String.self, forKey: .coverTmdb)
    }
}

struct EpisodeInfo: Codable {
    let id: String?
    let episodeNum: Int
    let title: String?
    let containerExtension: String?
    let info: EpisodeDetailInfo?
    let customSid: String?
    let added: String?
    let season: Int
    let directSource: String?

    enum CodingKeys: String, CodingKey {
        case id
        case episodeNum = "episode_num"
        case title
        case containerExtension = "container_extension"
        case info
        case customSid = "custom_sid"
        case added
        case season
        case directSource = "direct_source"
    }
}

struct EpisodeDetailInfo: Codable {
    let name: String?
    let overview: String?
    let airDate: String?
    let rating: Double?
    let releaseDate: String?
    let movieImage: String?
    let duration: String?
    let durationSecs: Int?
    let bitrate: Int?

    enum CodingKeys: String, CodingKey {
        case name
        case overview
        case airDate = "air_date"
        case rating
        case releaseDate = "releasedate"
        case movieImage = "movie_image"
        case duration
        case durationSecs = "duration_secs"
        case bitrate
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        name = try container.decodeIfPresent(String.self, forKey: .name)
        overview = try container.decodeIfPresent(String.self, forKey: .overview)
        airDate = try container.decodeIfPresent(String.self, forKey: .airDate)
        releaseDate = try container.decodeIfPresent(String.self, forKey: .releaseDate)
        movieImage = try container.decodeIfPresent(String.self, forKey: .movieImage)
        duration = try container.decodeIfPresent(String.self, forKey: .duration)
        durationSecs = try container.decodeIfPresent(Int.self, forKey: .durationSecs)
        bitrate = try container.decodeIfPresent(Int.self, forKey: .bitrate)

        // Décodage flexible pour rating (Double ou String)
        rating = container.decodeFlexibleDoubleIfPresent(forKey: .rating)
    }
}
