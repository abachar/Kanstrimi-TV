//
//  Movies.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Modèles de réponse API Xtream pour VOD (Movies)
//

import Foundation

// MARK: - VOD (Movies) Categories & Streams

struct VODCategoryResponse: Codable {
    let categoryId: String
    let categoryName: String
    let parentId: Int?

    enum CodingKeys: String, CodingKey {
        case categoryId = "category_id"
        case categoryName = "category_name"
        case parentId = "parent_id"
    }
}

struct MovieResponse: Codable {
    let num: Int?
    let name: String
    let title: String?
    let year: String?
    let streamType: String?
    let streamId: Int
    let streamIcon: String?
    let rating: String?
    let rating5based: Double?
    let added: String?
    let categoryId: String?
    let categoryName: String?
    let containerExtension: String?
    let customSid: String?
    let directSource: String?
    let tmdb: Int?

    enum CodingKeys: String, CodingKey {
        case num
        case name
        case title
        case year
        case streamType = "stream_type"
        case streamId = "stream_id"
        case streamIcon = "stream_icon"
        case rating
        case rating5based = "rating_5based"
        case added
        case categoryId = "category_id"
        case categoryName = "category_name"
        case containerExtension = "container_extension"
        case customSid = "custom_sid"
        case directSource = "direct_source"
        case tmdb
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        num = try container.decodeIfPresent(Int.self, forKey: .num)
        name = try container.decode(String.self, forKey: .name)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        year = try container.decodeIfPresent(String.self, forKey: .year)
        streamType = try container.decodeIfPresent(String.self, forKey: .streamType)
        streamId = try container.decode(Int.self, forKey: .streamId)
        streamIcon = try container.decodeIfPresent(String.self, forKey: .streamIcon)
        rating = try container.decodeIfPresent(String.self, forKey: .rating)
        added = try container.decodeIfPresent(String.self, forKey: .added)
        categoryId = try container.decodeIfPresent(String.self, forKey: .categoryId)
        categoryName = try container.decodeIfPresent(String.self, forKey: .categoryName)
        containerExtension = try container.decodeIfPresent(String.self, forKey: .containerExtension)
        customSid = try container.decodeIfPresent(String.self, forKey: .customSid)
        directSource = try container.decodeIfPresent(String.self, forKey: .directSource)
        rating5based = container.decodeFlexibleDoubleIfPresent(forKey: .rating5based)
        tmdb = container.decodeFlexibleIntIfPresent(forKey: .tmdb)
    }
}

struct MovieInfo: Codable {
    let info: MovieDetailInfo?
    let movieData: MovieData?

    enum CodingKeys: String, CodingKey {
        case info
        case movieData = "movie_data"
    }
}

struct MovieDetailInfo: Codable {
    let kinopoiskUrl: String?
    let tmdbId: Int?
    let name: String?
    let coverBig: String?
    let plot: String?
    let cast: String?
    let director: String?
    let genre: String?
    let releaseDate: String?
    let duration: String?
    let durationSecs: Int?
    let youtubeTrailer: String?
    let rating: Double?
    let rating5based: Double?
    let backdropPath: [String]?

    enum CodingKeys: String, CodingKey {
        case kinopoiskUrl = "kinopoisk_url"
        case tmdbId = "tmdb_id"
        case name
        case coverBig = "cover_big"
        case plot
        case cast
        case director
        case genre
        case releaseDate = "releasedate"
        case duration
        case durationSecs = "duration_secs"
        case youtubeTrailer = "youtube_trailer"
        case rating
        case rating5based = "rating_5based"
        case backdropPath = "backdrop_path"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        kinopoiskUrl = try container.decodeIfPresent(String.self, forKey: .kinopoiskUrl)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        coverBig = try container.decodeIfPresent(String.self, forKey: .coverBig)
        plot = try container.decodeIfPresent(String.self, forKey: .plot)
        cast = try container.decodeIfPresent(String.self, forKey: .cast)
        director = try container.decodeIfPresent(String.self, forKey: .director)
        genre = try container.decodeIfPresent(String.self, forKey: .genre)
        releaseDate = try container.decodeIfPresent(String.self, forKey: .releaseDate)
        duration = try container.decodeIfPresent(String.self, forKey: .duration)
        durationSecs = try container.decodeIfPresent(Int.self, forKey: .durationSecs)
        youtubeTrailer = try container.decodeIfPresent(String.self, forKey: .youtubeTrailer)
        tmdbId = container.decodeFlexibleIntIfPresent(forKey: .tmdbId)
        rating = container.decodeFlexibleDoubleIfPresent(forKey: .rating)
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

struct MovieData: Codable {
    let streamId: Int?
    let name: String?
    let added: String?
    let categoryId: String?
    let containerExtension: String?
    let customSid: String?
    let directSource: String?

    enum CodingKeys: String, CodingKey {
        case streamId = "stream_id"
        case name
        case added
        case categoryId = "category_id"
        case containerExtension = "container_extension"
        case customSid = "custom_sid"
        case directSource = "direct_source"
    }
}

// MARK: - Media Info (shared between Movies and Series)

struct VideoInfo: Codable {
    let index: Int?
    let codecName: String?
    let codecLongName: String?
    let profile: String?
    let codecType: String?
    let codecTimeBase: String?
    let codecTagString: String?
    let codecTag: String?
    let width: Int?
    let height: Int?
    let codedWidth: Int?
    let codedHeight: Int?

    enum CodingKeys: String, CodingKey {
        case index
        case codecName = "codec_name"
        case codecLongName = "codec_long_name"
        case profile
        case codecType = "codec_type"
        case codecTimeBase = "codec_time_base"
        case codecTagString = "codec_tag_string"
        case codecTag = "codec_tag"
        case width
        case height
        case codedWidth = "coded_width"
        case codedHeight = "coded_height"
    }
}

struct AudioInfo: Codable {
    let index: Int?
    let codecName: String?
    let codecLongName: String?
    let codecType: String?
    let codecTimeBase: String?
    let codecTagString: String?
    let codecTag: String?
    let sampleFmt: String?
    let sampleRate: String?
    let channels: Int?
    let channelLayout: String?

    enum CodingKeys: String, CodingKey {
        case index
        case codecName = "codec_name"
        case codecLongName = "codec_long_name"
        case codecType = "codec_type"
        case codecTimeBase = "codec_time_base"
        case codecTagString = "codec_tag_string"
        case codecTag = "codec_tag"
        case sampleFmt = "sample_fmt"
        case sampleRate = "sample_rate"
        case channels
        case channelLayout = "channel_layout"
    }
}
