import AetherEngine
import SwiftUI

/// What the engine read in the stream and how it plays it: the facts of the file itself, to check
/// what a provider's label ("4K Dolby Vision") really delivers. Nothing shows before a stream is open.
struct StreamFacts: View {
    @ObservedObject var engine: AetherEngine

    var body: some View {
        let lines = [("Vidéo", video), ("Image", picture), ("Audio", audio), ("Lecture", playback)].filter { !$0.1.isEmpty }
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(lines, id: \.0) { title, facts in
                    Text("\(title) : \(facts.joined(separator: " · "))")
                }
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(Theme.secondary)
            .padding(.top, 6)
        }
    }

    /// "HEVC Main 10 · 3840×2160 · 23,976 i/s · 10 bits · 18,2 Mb/s".
    private var video: [String] {
        guard let codec = engine.sourceVideoCodecName else { return [] }
        let format = engine.sourceVideoStreamFormat
        return [
            [Self.videoCodecs[codec] ?? codec.uppercased(), format?.profile].compactMap { $0 }.joined(separator: " "),
            engine.sourceVideoWidth > 0 ? "\(engine.sourceVideoWidth)×\(engine.sourceVideoHeight)" : nil,
            engine.sourceVideoFrameRate.map { "\(Self.decimal($0, digits: 3)) i/s" },
            format?.bitDepth.map { "\($0) bits" },
            engine.sourceVideoBitrate > 0 ? "\(Self.decimal(Double(engine.sourceVideoBitrate) / 1_000_000, digits: 1)) Mb/s" : nil,
        ].compactMap { $0 }
    }

    /// What the file carries against what reaches the television: "source Dolby Vision profil 8 · affichée HDR10 · PQ · BT.2020".
    private var picture: [String] {
        guard engine.sourceVideoCodecName != nil else { return [] }
        let format = engine.sourceVideoStreamFormat
        let source = Self.label(engine.sourceVideoFormat) + (engine.sourceDVProfile.map { " profil \($0)" } ?? "")
        return [
            "source \(source)",
            "affichée \(Self.label(engine.videoFormat))",
            engine.dolbyVisionConversion == .profile7ToProfile81 ? "profil 7 converti en 8.1" : nil,
            format?.transferLabel,
            format?.colorPrimariesLabel,
        ].compactMap { $0 }
    }

    /// The track playing: "E-AC-3 Atmos · 5.1 · 768 kb/s · transmis tel quel".
    private var audio: [String] {
        guard let track = engine.audioTracks.first(where: { $0.id == engine.activeAudioTrackIndex }) else { return [] }
        let codec = [Self.audioCodecs[track.codec] ?? track.codec.uppercased(), track.isAtmos ? "Atmos" : track.profile]
            .compactMap { $0 }.joined(separator: " ")
        return [
            codec,
            track.channelLayout ?? (track.channels > 0 ? "\(track.channels) canaux" : nil),
            track.bitrate > 0 ? "\(track.bitrate / 1000) kb/s" : nil,
            Self.deliveries[engine.audioDelivery],
        ].compactMap { $0 }
    }

    /// The container that arrived, the route the picture takes, what decodes it, and on tvOS whether the television may follow.
    private var playback: [String] {
        [
            engine.sourceContainerFormat.map { Self.containers[$0] ?? $0 },
            Self.routes[engine.videoRoute],
            engine.activeVideoDecoder,
            Platform.matchesContent.map { "adaptation au contenu \($0 ? "activée" : "désactivée")" },
        ].compactMap { $0 }
    }

    private static func label(_ format: VideoFormat) -> String {
        switch format {
        case .sdr: "SDR"
        case .hdr10: "HDR10"
        case .hdr10Plus: "HDR10+"
        case .dolbyVision: "Dolby Vision"
        case .hlg: "HLG"
        }
    }

    private static func decimal(_ value: Double, digits: Int) -> String {
        value.formatted(.number.precision(.fractionLength(0...digits)).locale(Locale(identifier: "fr_FR")))
    }

    private static let videoCodecs = ["hevc": "HEVC", "h264": "H.264", "av1": "AV1", "mpeg2video": "MPEG-2", "mpeg4": "MPEG-4", "vp9": "VP9"]
    private static let audioCodecs = ["eac3": "E-AC-3", "ac3": "AC-3", "aac": "AAC", "truehd": "TrueHD", "dts": "DTS", "mp2": "MP2", "mp3": "MP3"]
    private static let containers = ["matroska,webm": "Matroska", "mpegts": "MPEG-TS", "mov,mp4,m4a,3gp,3g2,mj2": "MP4", "avi": "AVI"]
    private static let routes: [VideoRoute: String] = [
        .loopback: "AVPlayer par HLS local", .remoteBypass: "AVPlayer direct", .software: "décodage logiciel",
    ]
    private static let deliveries: [AudioDelivery: String] = [
        .noAudioInSource: "aucun son dans la source", .streamCopy: "transmis tel quel", .bridged: "réencodé pour AVPlayer",
        .decoded: "décodé par l'app", .droppedNoPipeline: "son abandonné", .playerManaged: "géré par AVPlayer",
    ]
}
