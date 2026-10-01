import AetherEngine
import SwiftUI

/// Draws the engine's subtitle cues over the video; the engine publishes them but paints nothing.
/// It watches the engine itself and only re-renders when the set of visible cues changes, not at
/// every clock tick (each render transaction makes the tvOS menus flicker).
struct SubtitleOverlay: View {
    let engine: AetherEngine
    @Environment(\.metrics) private var metrics
    @State private var cues: [SubtitleCue] = []
    @State private var visible: [SubtitleCue] = []

    var body: some View {
        GeometryReader { geo in
            let frame = Self.videoFrame(in: geo.size)
            ZStack {
                ForEach(visible) { cue in
                    switch cue.body {
                    case .image(let image): bitmap(image, in: frame)
                    case .text, .richText: text(cue, in: frame, letterboxed: frame.height < geo.size.height - 1)
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .allowsHitTesting(false)
        .onReceive(engine.$subtitleCues) { cues = $0; refresh(at: engine.clock.sourceTime) }
        .onReceive(engine.clock.$sourceTime) { refresh(at: $0) }
    }

    /// Keeps the state untouched unless the visible cues changed.
    private func refresh(at time: Double) {
        let now = cues.filter { $0.startTime <= time && time < $0.endTime }
        if now.map(\.id) != visible.map(\.id) { visible = now }
    }

    /// Bottom centre of the picture by default, top when the source asked for a top alignment (ASS `\an7`...`\an9`).
    /// Placed against the picture's frame like a bitmap: on an upright iPhone the screen's bottom is far below it.
    /// Letterboxed (upright iPhone), a little higher: the line sits closer to the picture's own bottom.
    private func text(_ cue: SubtitleCue, in frame: CGRect, letterboxed: Bool) -> some View {
        let onTop = (cue.placement?.alignment).map { (7...9).contains($0) } ?? false
        return Text(Self.stripped(cue.text ?? ""))
            .font(.system(size: metrics.subtitleSize, weight: .semibold))
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .shadow(color: .black, radius: 3, x: 0, y: 1)
            .shadow(color: .black.opacity(0.8), radius: 6)
            .padding(.horizontal, metrics.inset)
            .padding(.vertical, metrics.compact ? (letterboxed ? 40 : 24) : 70)
            .frame(width: frame.width, height: frame.height, alignment: onTop ? .top : .bottom)
            .position(x: frame.midX, y: frame.midY)
    }

    /// The engine maps a bitmap onto its canvas, the canvas width-aligned and centred on the video.
    private func bitmap(_ image: SubtitleImage, in frame: CGRect) -> some View {
        let canvas = image.canvasSize == .zero ? frame.size : CGSize(width: frame.width, height: frame.width * image.canvasSize.height / image.canvasSize.width)
        let origin = CGPoint(x: frame.minX, y: frame.midY - canvas.height / 2)
        let rect = CGRect(x: origin.x + image.position.minX * canvas.width, y: origin.y + image.position.minY * canvas.height,
                          width: image.position.width * canvas.width, height: image.position.height * canvas.height)
        return Image(decorative: image.cgImage, scale: 1)
            .resizable()
            .frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
    }

    /// A 16:9 picture fitted in the screen, centred.
    private static func videoFrame(in size: CGSize) -> CGRect {
        let height = min(size.height, size.width * 9 / 16)
        let width = height * 16 / 9
        return CGRect(x: (size.width - width) / 2, y: (size.height - height) / 2, width: width, height: height)
    }

    /// Markup left in plain text (`<i>`, `<font ...>`).
    private static func stripped(_ text: String) -> String {
        text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
    }
}
