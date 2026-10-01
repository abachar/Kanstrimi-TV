import AetherEngine
import SwiftUI

/// What plays, as the engine read it in the stream: the picture's badges, then the sound's. Until the
/// stream is read they say what the provider's label announces; after, a badge turns amber where the
/// stream falls short of that label ("HDR10" for an announced Dolby Vision).
struct StreamFacts: View {
    let player: PlayerService
    @ObservedObject private var engine: AetherEngine
    @Environment(\.metrics) private var metrics
    /// Mb/s measured over what has played, for the streams that declare no bitrate (a live channel).
    @State private var measuredMegabits: Int?

    init(player: PlayerService) {
        self.player = player
        engine = player.engine
    }

    private struct Fact: Hashable {
        let text: String
        var warning = false
    }

    /// What the engine read, or a sample of it where no stream plays (previews, staged states).
    private struct Reading {
        var videoCodec: String?
        var width = 0
        var shown = VideoFormat.sdr
        var frameRate: Double?
        var bitrate: Int64 = 0
        var software = false
        var audioCodec: String?
        var channels = 0
        var atmos = false
        var delivery = AudioDelivery.none
        /// tvOS: whether the television may switch to the dynamic range of what plays; nil where that does not apply.
        var followsContent: Bool?

        #if DEBUG
        static let sampleFilm = Reading(videoCodec: "hevc", width: 3840, shown: .dolbyVision, frameRate: 23.976, bitrate: 22_900_000,
                                        audioCodec: "eac3", channels: 6, atmos: true, delivery: .streamCopy)
        static let sampleLive = Reading(videoCodec: "hevc", width: 3840, shown: .sdr, frameRate: 50, bitrate: 14_000_000, software: true,
                                        audioCodec: "aac", channels: 2, delivery: .decoded)
        #endif
    }

    var body: some View {
        if let version = player.version {
            let reading = reading
            let picture = picture(reading, announced: version)
            let sound = sound(reading, announced: version)
            Group {
                if metrics.compact {
                    VStack(alignment: .leading, spacing: 8) {
                        group("film", picture)
                        group("speaker.wave.2", sound)
                        sourceLabel(of: version)
                    }
                } else {
                    HStack(spacing: 36) {
                        group("film", picture)
                        group("speaker.wave.2", sound)
                        sourceLabel(of: version)
                    }
                }
            }
            .padding(.top, metrics.compact ? 6 : 12)
            // The telemetry ticks every second: the state only moves when the rounded figure does.
            .onReceive(engine.diagnostics.$liveTelemetry) { telemetry in
                let megabits = telemetry?.averageBitrateMbps.map { Int($0.rounded()) }
                if megabits != measuredMegabits { measuredMegabits = megabits }
            }
        }
    }

    private func group(_ symbol: String, _ facts: [Fact]) -> some View {
        Flow(spacing: metrics.compact ? 6 : 10) {
            Image(systemName: symbol).font(.system(size: metrics.badge * 1.3)).foregroundStyle(Theme.secondary)
            ForEach(facts, id: \.self) { fact in
                Badge(fact.text, color: fact.warning ? Theme.accent : Theme.text, verbatim: true)
            }
        }
    }

    /// The copy of the version in use, named only when there are several to switch between.
    @ViewBuilder private func sourceLabel(of version: Version) -> some View {
        if version.sources.count > 1, let source = player.source {
            Text(player.sourceLabel(source, in: version)).font(.caption).foregroundStyle(Theme.secondary)
        }
    }

    // MARK: - Facts

    private var reading: Reading? {
        #if DEBUG
        if player.debugFrame { return player.isLive ? .sampleLive : .sampleFilm }
        #endif
        guard let codec = engine.sourceVideoCodecName else { return nil }
        let track = engine.audioTracks.first { $0.id == engine.activeAudioTrackIndex }
        return Reading(videoCodec: codec, width: Int(engine.sourceVideoWidth), shown: engine.videoFormat,
                       frameRate: engine.sourceVideoFrameRate, bitrate: engine.sourceVideoBitrate,
                       software: engine.videoRoute == .software, audioCodec: track?.codec, channels: track?.channels ?? 0,
                       atmos: track?.isAtmos ?? false, delivery: engine.audioDelivery, followsContent: Platform.matchesContent)
    }

    /// Definition, dynamic range as shown on the screen, codec, frame rate, bitrate.
    private func picture(_ reading: Reading?, announced version: Version) -> [Fact] {
        guard let reading, let codec = reading.videoCodec else {
            return [Fact(text: version.quality.rawValue)] + (version.dynamicRange.map { [Fact(text: $0 == .sdr ? "SDR" : $0.label)] } ?? [])
        }
        let quality = Self.quality(width: reading.width)
        let range = Self.range(reading.shown)
        var facts = [
            Fact(text: quality.rawValue, warning: quality < version.quality),
            Fact(text: Self.label(reading.shown), warning: range < (version.dynamicRange ?? .sdr)),
            Fact(text: Self.videoCodecs[codec] ?? codec.uppercased()),
        ]
        if let rate = reading.frameRate, rate > 0 { facts.append(Fact(text: "\(Int(rate.rounded())) i/s")) }
        if reading.bitrate > 0 {
            facts.append(Fact(text: "\(Self.megabits(reading.bitrate)) Mb/s"))
        } else if let measuredMegabits, measuredMegabits > 0 {
            facts.append(Fact(text: "\(measuredMegabits) Mb/s"))
        }
        // A film decoded by the app instead of the system player: no Dolby Vision, no hardware decoder.
        if reading.software, !player.isLive { facts.append(Fact(text: "Décodage logiciel", warning: true)) }
        if range > .sdr, reading.followsContent == false { facts.append(Fact(text: "Adaptation au contenu désactivée", warning: true)) }
        return facts
    }

    /// Language of the version, codec and channels of the track playing, Atmos when it carries it.
    private func sound(_ reading: Reading?, announced version: Version) -> [Fact] {
        var facts = [Fact(text: version.language.label)]
        guard let reading, let codec = reading.audioCodec else { return facts }
        facts.append(Fact(text: [Self.audioCodecs[codec] ?? codec.uppercased(), Self.layouts[reading.channels]].compactMap { $0 }.joined(separator: " ")))
        if reading.atmos { facts.append(Fact(text: "Atmos")) }
        switch reading.delivery {
        case .bridged: facts.append(Fact(text: "Réencodé", warning: true))
        case .droppedNoPipeline: facts.append(Fact(text: "Son abandonné", warning: true))
        default: break
        }
        return facts
    }

    /// By the width: a 2.39:1 film in 4K is 3840×1606.
    private static func quality(width: Int) -> Quality {
        switch width {
        case 3000...: .uhd
        case 1800...: .fhd
        case 1200...: .hd
        default: .sd
        }
    }

    private static func range(_ format: VideoFormat) -> DynamicRange {
        switch format {
        case .sdr: .sdr
        case .hdr10, .hdr10Plus, .hlg: .hdr
        case .dolbyVision: .dolbyVision
        }
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

    /// "23", or "4,5" under 10 Mb/s.
    private static func megabits(_ bitsPerSecond: Int64) -> String {
        let value = Double(bitsPerSecond) / 1_000_000
        return value.formatted(.number.precision(.fractionLength(0...(value < 10 ? 1 : 0))).locale(Locale(identifier: "fr_FR")))
    }

    private static let videoCodecs = ["hevc": "HEVC", "h264": "H.264", "av1": "AV1", "mpeg2video": "MPEG-2", "mpeg4": "MPEG-4", "vp9": "VP9"]
    private static let audioCodecs = ["eac3": "E-AC-3", "ac3": "AC-3", "aac": "AAC", "truehd": "TrueHD", "dts": "DTS", "mp2": "MP2", "mp3": "MP3"]
    private static let layouts = [1: "1.0", 2: "2.0", 6: "5.1", 8: "7.1"]
}

/// Lays its views out in a row and wraps to the next line when the width runs out.
private struct Flow: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(subviews, width: proposal.width ?? .infinity).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (subview, origin) in zip(subviews, arrange(subviews, width: bounds.width).origins) {
            subview.place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), proposal: .unspecified)
        }
    }

    /// Each view vertically centred in its line.
    private func arrange(_ subviews: Subviews, width: CGFloat) -> (size: CGSize, origins: [CGPoint]) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let lineHeight = sizes.map(\.height).max() ?? 0
        var origins: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, widest: CGFloat = 0
        for size in sizes {
            if x > 0, x + size.width > width { x = 0; y += lineHeight + spacing }
            origins.append(CGPoint(x: x, y: y + (lineHeight - size.height) / 2))
            x += size.width + spacing
            widest = max(widest, x - spacing)
        }
        return (CGSize(width: widest, height: sizes.isEmpty ? 0 : y + lineHeight), origins)
    }
}
