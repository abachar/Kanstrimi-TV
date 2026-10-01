import SwiftUI
import UIKit

/// What differs between the television and the phone, in one place. Views stay free of
/// `#if os(...)`: they read `Metrics` for sizes and use the modifiers below for the APIs one
/// platform lacks.
nonisolated enum Platform {
    /// "Apple TV" or "iPhone": the device the app runs on, for the messages that name it.
    /// iPad will need the runtime idiom; for now the platform is enough.
    static let deviceKind: String = {
        #if os(tvOS)
        "Apple TV"
        #else
        "iPhone"
        #endif
    }()

    static var isTV: Bool {
        #if os(tvOS)
        true
        #else
        false
        #endif
    }

    /// Where a YouTube trailer opens: the YouTube app on tvOS, which has no browser (nil when it
    /// is not installed, and the button hides), the web page elsewhere. The player does not read a YouTube page.
    @MainActor static func trailerURL(_ web: URL) -> URL? {
        #if os(tvOS)
        guard var c = URLComponents(url: web, resolvingAgainstBaseURL: false) else { return nil }
        c.scheme = "youtube"
        guard let app = c.url, UIApplication.shared.canOpenURL(app) else { return nil }
        return app
        #else
        web
        #endif
    }

}

/// Sizes tuned for a screen seen from the sofa versus one held in the hand. One value per
/// platform today; a compact/regular variant will do for iPad. `nil` means "no fixed size":
/// the element takes the width it is given.
nonisolated struct Metrics: Sendable {
    /// Layout for a screen held in the hand (iPhone): fewer facts on a card, actions sized for a thumb,
    /// system bars and titles. The television keeps its own, focus-driven layout.
    var compact: Bool
    /// Side margin of every screen. On tvOS the overscan safe zone (80 pt) plus a little air.
    var inset: CGFloat
    /// Poster card width (2:3), landscape "Reprendre" card width (16:9), space between cards,
    /// and the vertical room a row leaves for the focus growth of tvOS.
    var posterWidth: CGFloat
    var resumeWidth: CGFloat
    var cardSpacing: CGFloat
    var rowPadding: CGFloat
    /// Fixed column count of the genre grid, nil for as many as fit.
    var gridColumns: Int?
    /// Title drawn on a poster without artwork.
    var artTitle: CGFloat
    /// Badge font sizes, regular and small.
    var badge: CGFloat
    var badgeSmall: CGFloat
    /// Home hero: height of the backdrop and size of the title.
    var heroHeight: CGFloat
    var heroTitle: CGFloat
    /// Detail sheet title size, the top padding above it, and the episode still width (16:9).
    var detailTitle: CGFloat
    var detailTop: CGFloat
    /// The box a title logo fits in, in place of the title.
    var detailLogo: CGSize
    var stillWidth: CGFloat
    /// Maximum width of running text (overview, cast line) so it stays readable.
    var textWidth: CGFloat
    /// Empty and error panels: icon size and padding.
    var stateIcon: CGFloat
    var statePadding: CGFloat
    /// Search: the best result's poster width and its column width.
    var searchPoster: CGFloat
    var searchColumn: CGFloat?
    /// Live: three columns with a preview (TV) or a stacked list (phone); logo size in the list.
    var liveColumns: Bool
    var channelLogo: CGFloat
    /// Pairing: title size, QR code shown (TV) or a link to the admin (phone), code cell width,
    /// and the right column width.
    var pairingTitle: CGFloat
    var showsQR: Bool
    var codeCell: CGFloat
    var pairingColumn: CGFloat?
    /// Player chrome: panel height and padding, version card width, channel list width, recent
    /// channel card width, dialog title size and width, next-episode card width, dialog margin.
    var panelHeight: CGFloat
    var panelPadding: CGFloat
    var panelCard: CGFloat
    var listWidth: CGFloat
    var recentCard: CGFloat
    var dialogTitle: CGFloat
    var dialogWidth: CGFloat
    var nextCard: CGFloat
    var dialogMargin: CGFloat
    /// Version picker: fixed width of the floating panel on TV, nil = the sheet's width on iOS;
    /// same for its toggles, which need a width only in a row.
    var pickerWidth: CGFloat?
    var toggleWidth: CGFloat?
    /// Diameter of a round icon button (detail sheet), the height of the play button beside it.
    var iconButton: CGFloat
    /// Subtitle text size, drawn by the app over the video.
    var subtitleSize: CGFloat

    static let tv = Metrics(compact: false, inset: 96, posterWidth: 250, resumeWidth: 400, cardSpacing: 36, rowPadding: 30, gridColumns: 6,
                            artTitle: 30, badge: 17, badgeSmall: 13,
                            heroHeight: 600, heroTitle: 64, detailTitle: 76, detailTop: 160, detailLogo: CGSize(width: 640, height: 200), stillWidth: 260, textWidth: 1000,
                            stateIcon: 56, statePadding: 60, searchPoster: 360, searchColumn: 400, liveColumns: true, channelLogo: 96,
                            pairingTitle: 56, showsQR: true, codeCell: 60, pairingColumn: 520,
                            panelHeight: 440, panelPadding: 48, panelCard: 300, listWidth: 620, recentCard: 460,
                            dialogTitle: 48, dialogWidth: 900, nextCard: 620, dialogMargin: 70,
                            pickerWidth: 1200, toggleWidth: 420, iconButton: 76, subtitleSize: 48)
    static let phone = Metrics(compact: true, inset: 16, posterWidth: 110, resumeWidth: 220, cardSpacing: 12, rowPadding: 8, gridColumns: nil,
                               artTitle: 14, badge: 12, badgeSmall: 10,
                               heroHeight: 470, heroTitle: 32, detailTitle: 30, detailTop: 40, detailLogo: CGSize(width: 260, height: 90), stillWidth: 140, textWidth: .infinity,
                               stateIcon: 40, statePadding: 24, searchPoster: 140, searchColumn: nil, liveColumns: false, channelLogo: 56,
                               pairingTitle: 28, showsQR: false, codeCell: 40, pairingColumn: nil,
                               panelHeight: 300, panelPadding: 20, panelCard: 200, listWidth: 340, recentCard: 240,
                               dialogTitle: 26, dialogWidth: 460, nextCard: 340, dialogMargin: 24,
                               pickerWidth: nil, toggleWidth: nil, iconButton: 44, subtitleSize: 17)
    static var current: Metrics {
        #if os(tvOS)
        return .tv
        #else
        return .phone
        #endif
    }
}

extension EnvironmentValues {
    @Entry var metrics: Metrics = .current
}

// MARK: - Modifiers hiding an API one platform lacks

/// On iOS `.card` does not exist: a plain button that shrinks a little while pressed.
private struct TouchCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension View {
    /// The lifting, focus-following card of tvOS; a touch feedback on iOS.
    @ViewBuilder func cardButtonStyle() -> some View {
        #if os(tvOS)
        buttonStyle(.card)
        #else
        buttonStyle(TouchCardStyle())
        #endif
    }

    /// The filled button. The app tint is white, and so would be its label, focused on tvOS
    /// included (white on white): the label is drawn dark everywhere.
    func prominentButtonStyle() -> some View {
        buttonStyle(.borderedProminent).foregroundStyle(.black)
    }

    /// The Back (Menu) button of the Siri Remote. iOS has no such command: its screens close
    /// with a button or a swipe, so this does nothing there.
    @ViewBuilder func onBackCommand(perform action: @escaping () -> Void) -> some View {
        #if os(tvOS)
        onExitCommand(perform: action)
        #else
        self
        #endif
    }

    /// The player screen as a whole. tvOS: edge to edge, its hosting controller hands the safe area back.
    /// iOS: the video and the veils go to the edges on their own; the controls stay clear of the notch.
    @ViewBuilder func playerIgnoresSafeArea() -> some View {
        #if os(tvOS)
        ignoresSafeArea()
        #else
        self
        #endif
    }

    /// iOS: edge to edge (the video layer, a veil, the gesture surface). Nothing more on tvOS, where
    /// the whole player already is.
    @ViewBuilder func touchIgnoresSafeArea() -> some View {
        #if os(iOS)
        ignoresSafeArea()
        #else
        self
        #endif
    }

    /// Margins of what floats over the video. The player lives in its own hosting controller on
    /// tvOS, which hands the safe area (80 pt) back to its content: the inset alone is the margin.
    /// On iOS the player keeps the safe area (notch, home indicator): a little air on top of it.
    @ViewBuilder func playerChromeInsets() -> some View {
        #if os(tvOS)
        padding(.horizontal, Metrics.tv.inset).padding(.vertical, 60).ignoresSafeArea()
        #else
        padding(.horizontal, 12).padding(.vertical, 8)
        #endif
    }

    /// Any touch on a panel counts as activity for its inactivity timer. Focus moves do that on tvOS.
    @ViewBuilder func touchActivity(_ onActivity: @escaping () -> Void) -> some View {
        #if os(iOS)
        simultaneousGesture(TapGesture().onEnded { onActivity() })
            .simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { _ in onActivity() })
        #else
        self
        #endif
    }

    /// iPhone: the screen's title in the navigation bar, large, shrinking into the bar as the content
    /// scrolls. tvOS has no navigation bar: the screen draws its own title.
    @ViewBuilder func phoneLargeTitle(_ title: String) -> some View {
        #if os(iOS)
        navigationTitle(title).navigationBarTitleDisplayMode(.large)
        #else
        self
        #endif
    }

    /// iPhone: a swipe, reported once the finger lifts with its translation. tvOS has no finger.
    @ViewBuilder func touchSwipe(_ onEnded: @escaping (CGSize) -> Void) -> some View {
        #if os(iOS)
        simultaneousGesture(DragGesture(minimumDistance: 30).onEnded { onEnded($0.translation) })
        #else
        self
        #endif
    }

    /// iPhone: a long press shows these actions over a preview of the card. tvOS keeps its press for focus.
    @ViewBuilder func touchContextMenu<Menu: View>(@ViewBuilder _ items: () -> Menu) -> some View {
        #if os(iOS)
        contextMenu(menuItems: items)
        #else
        self
        #endif
    }

    /// iPhone: a main button's label as wide as the screen and a thumb high. Unchanged on the television.
    @ViewBuilder func phoneFullWidth(_ metrics: Metrics, height: CGFloat = 36) -> some View {
        if metrics.compact {
            frame(maxWidth: .infinity).frame(height: height)
        } else {
            self
        }
    }

    /// A secondary screen (version picker): full screen on tvOS, a sheet on iOS.
    @ViewBuilder func platformSheet<Item: Identifiable, Content: View>(item: Binding<Item?>, @ViewBuilder content: @escaping (Item) -> Content) -> some View {
        #if os(tvOS)
        fullScreenCover(item: item, content: content)
        #else
        sheet(item: item, content: content)
        #endif
    }

    @ViewBuilder func platformSheet<Content: View>(isPresented: Binding<Bool>, @ViewBuilder content: @escaping () -> Content) -> some View {
        #if os(tvOS)
        fullScreenCover(isPresented: isPresented, content: content)
        #else
        sheet(isPresented: isPresented, content: content)
        #endif
    }
}
