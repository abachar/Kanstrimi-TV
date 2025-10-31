//
//  LiveTV.swift
//  Kanstrimi TV
//
//  Created on 2025-10-26.
//  Modèles de réponse API Xtream pour Live TV et EPG
//

import Foundation

// MARK: - Live TV Categories & Streams

struct LiveCategoryResponse: Codable {
    let categoryId: String
    let categoryName: String
    let parentId: Int?

    enum CodingKeys: String, CodingKey {
        case categoryId = "category_id"
        case categoryName = "category_name"
        case parentId = "parent_id"
    }

    /// Conversion vers Category
    func toCategory(sortOrder: Int) -> Category {
        Category(
            contentType: .live,
            categoryId: categoryId,
            name: categoryName,
            sortOrder: sortOrder
        )
    }
}

struct LiveChannelResponse: Codable {
    let num: Int?
    let name: String
    let streamType: String
    let streamId: Int
    let streamIcon: String?
    let epgChannelId: String?
    let added: String?
    let categoryId: String
    let categoryName: String?
    let customSid: String?
    let tvArchive: Int?
    let directSource: String?
    let tvArchiveDuration: Int?

    enum CodingKeys: String, CodingKey {
        case num
        case name
        case streamType = "stream_type"
        case streamId = "stream_id"
        case streamIcon = "stream_icon"
        case epgChannelId = "epg_channel_id"
        case added
        case categoryId = "category_id"
        case categoryName = "category_name"
        case customSid = "custom_sid"
        case tvArchive = "tv_archive"
        case directSource = "direct_source"
        case tvArchiveDuration = "tv_archive_duration"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        num = try container.decodeIfPresent(Int.self, forKey: .num)
        name = try container.decode(String.self, forKey: .name)
        streamType = try container.decode(String.self, forKey: .streamType)
        streamId = try container.decode(Int.self, forKey: .streamId)
        streamIcon = try container.decodeIfPresent(String.self, forKey: .streamIcon)
        epgChannelId = try container.decodeIfPresent(String.self, forKey: .epgChannelId)
        added = try container.decodeIfPresent(String.self, forKey: .added)
        categoryId = try container.decodeIfPresent(String.self, forKey: .categoryId) ?? "0"
        categoryName = try container.decodeIfPresent(String.self, forKey: .categoryName)
        customSid = try container.decodeIfPresent(String.self, forKey: .customSid)
        tvArchive = try container.decodeIfPresent(Int.self, forKey: .tvArchive)
        directSource = try container.decodeIfPresent(String.self, forKey: .directSource)
        tvArchiveDuration = container.decodeFlexibleIntIfPresent(forKey: .tvArchiveDuration)
    }

    /// Conversion vers LiveChannel
    func toLiveChannel(sortOrder: Int, streamURL: String) -> LiveChannel {
        LiveChannel(
            streamId: streamId,
            name: name,
            categoryId: categoryId,
            sortOrder: sortOrder,
            streamIcon: streamIcon,
            streamURL: streamURL,
            epgChannelId: epgChannelId,
            added: added
        )
    }
}

// MARK: - EPG (Electronic Program Guide)

struct EPGResponse: Codable {
    let epgListings: [EPGListing]?

    enum CodingKeys: String, CodingKey {
        case epgListings = "epg_listings"
    }
}

struct EPGListing: Codable {
    let id: String
    let epgId: String
    let title: String
    let lang: String?
    let start: String
    let end: String
    let programDescription: String?
    let channelId: String

    enum CodingKeys: String, CodingKey {
        case id
        case epgId = "epg_id"
        case title
        case lang
        case start
        case end
        case programDescription = "description"
        case channelId = "channel_id"
    }
}
