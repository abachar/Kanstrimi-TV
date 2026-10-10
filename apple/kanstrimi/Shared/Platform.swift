import AVKit
import SwiftUI
import UIKit

/// What differs between the television, the phone and the tablet, in one place. Views stay free of
/// `#if os(...)`: they read `Metrics` for sizes and use the modifiers below for the APIs one
/// platform lacks.
nonisolated enum Platform {
    /// "Apple TV", "iPad" or "iPhone": the device the app runs on, for the messages that name it.
    static var deviceKind: String {
        #if os(tvOS)
        "Apple TV"
        #else
        isPad ? "iPad" : "iPhone"
        #endif
    }

    static var isTV: Bool {
        #if os(tvOS)
        true
        #else
        false
        #endif
    }

    /// The tablet: touch like the phone, room like the television. Known at run time, the one binary serving both.
    static let isPad: Bool = {
        #if os(tvOS)
        false
        #else
        // Read once, at the first use, which the app makes on the main thread.
        MainActor.assumeIsolated { UIDevice.current.userInterfaceIdiom == .pad }
        #endif
    }()

    /// Réglages is a tab on the television and the tablet; the phone keeps five tabs and pushes it from the home screen.
    static var hasSettingsTab: Bool { isTV || isPad }

    /// tvOS: whether Réglages › Vidéo et audio › Ajuster le contenu lets the player switch the television
    /// to the dynamic range of what plays. nil where the screen is the device's own.
    @MainActor static var matchesContent: Bool? {
        #if os(tvOS)
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.windows.first?.avDisplayManager.isDisplayCriteriaMatchingEnabled
        #else
        nil
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

/// Sizes tuned for a screen seen from the sofa, one held in the hand, and the tablet in between. Three sets:
/// `tv`, `phone` and `pad`; the tablet takes `phone` while its window is narrow (Split View, Slide Over). `nil`
/// means "no fixed size": the element takes the width it is given.
nonisolated struct Metrics: Sendable {
    /// Layout for a screen held in the hand (iPhone, a narrow iPad window): fewer facts on a card, actions sized for a
    /// thumb, system bars and titles. The television and the wide tablet keep the roomy, focus-born layout; what is
    /// focus itself (lift, halo, label on the focused one) asks `Platform.isTV`.
    var compact: Bool
    /// Side margin of every screen. On tvOS the overscan safe zone (80 pt) plus a little air.
    var inset: CGFloat
    /// Poster card width (2:3), landscape "Reprendre" card width (16:9), space between cards,
    /// and the vertical room a row leaves for the focus growth of tvOS.
    var posterWidth: CGFloat
    var resumeWidth: CGFloat
    var cardSpacing: CGFloat
    var rowPadding: CGFloat
    /// The gap between a poster and the facts under it; on tvOS, room for the focused poster's lift.
    var factsGap: CGFloat
    /// Fixed column count of the genre grid, nil for as many as fit.
    var gridColumns: Int?
    /// Title drawn on a poster without artwork.
    var artTitle: CGFloat
    /// Badge font sizes, regular and small.
    var badge: CGFloat
    var badgeSmall: CGFloat
    /// Home hero: its height in the page (the TV backdrop runs on under the first row) and the size of the title.
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
    /// Live: three columns with a preview (TV, tablet) or a stacked list (phone).
    var liveColumns: Bool
    /// Pairing: title size, QR code shown (TV) or a link to the admin (phone, tablet), code cell width,
    /// and the right column width.
    var pairingTitle: CGFloat
    var showsQR: Bool
    var codeCell: CGFloat
    var pairingColumn: CGFloat?
    /// Player chrome: panel padding, version card width, channel list width, recent
    /// channel card width, dialog title size and width, next-episode card width, dialog margin.
    var panelPadding: CGFloat
    var panelCard: CGFloat
    var listWidth: CGFloat
    var recentCard: CGFloat
    var dialogTitle: CGFloat
    var dialogWidth: CGFloat
    var nextCard: CGFloat
    var dialogMargin: CGFloat
    /// Version picker: fixed width of the floating panel on TV, nil = the sheet's width on iOS.
    var pickerWidth: CGFloat?
    /// Diameter of a round icon button (detail sheet), the height of the play button beside it.
    var iconButton: CGFloat
    /// Diameter of an actor's photo on the sheet's cast row.
    var castPhoto: CGFloat
    /// Subtitle text size, drawn by the app over the video.
    var subtitleSize: CGFloat
    /// Corner radii: a poster or a tile, a wide 16:9 card.
    var cardRadius: CGFloat
    var wideRadius: CGFloat
    /// Fonts and spacing of the player's header and time line (`PlayerHeader`, `PlayerTimeLine`).
    var playerText: PlayerText

    /// A poster's box, 2:3 at the platform's width.
    var posterSize: CGSize { CGSize(width: posterWidth, height: posterWidth * 1.5) }
    /// Widths the parents give their cards: a studio tile, an actor's cell, the « À suivre » card.
    var studioWidth: CGFloat { posterWidth * 1.5 }
    var castCell: CGFloat { castPhoto + (compact ? 12 : 30) }
    var upNextWidth: CGFloat { compact ? 300 : nextCard }
    /// A programme of the player's strip, its margins included.
    var programmeCard: CGSize {
        let pad: CGFloat = compact ? 14 : 20
        return CGSize(width: panelCard + 2 * pad, height: panelCard * 0.7 + 2 * pad)
    }

    /// The player bar's text: the header (title, episode, channel), the live bar and the time line.
    struct PlayerText: Sendable {
        var liveSpacing: CGFloat
        var vodSpacing: CGFloat
        var tagSpacing: CGFloat
        var liveTag: LiveTag.Size
        var name: Font
        var programme: Font
        var episode: Font
        var title: Font
        /// Line limit of the header's texts, nil for none.
        var lines: Int?
        var time: Font
        /// The live bar: space between the bar and its caption, the bar's height.
        var liveBarSpacing: CGFloat
        var liveBarHeight: CGFloat
    }

    static let tv = Metrics(compact: false, inset: 96, posterWidth: 250, resumeWidth: 400, cardSpacing: 36, rowPadding: 30, factsGap: 26, gridColumns: 6,
                            artTitle: 30, badge: 17, badgeSmall: 13,
                            heroHeight: 680, heroTitle: 64, detailTitle: 76, detailTop: 160, detailLogo: CGSize(width: 640, height: 200), stillWidth: 260, textWidth: 1000,
                            stateIcon: 56, statePadding: 60, liveColumns: true,
                            pairingTitle: 56, showsQR: true, codeCell: 60, pairingColumn: 520,
                            panelPadding: 48, panelCard: 300, listWidth: 620, recentCard: 460,
                            dialogTitle: 48, dialogWidth: 900, nextCard: 620, dialogMargin: 70,
                            pickerWidth: 1200, iconButton: 76, castPhoto: 150, subtitleSize: 48,
                            cardRadius: 14, wideRadius: 16,
                            playerText: PlayerText(liveSpacing: 8, vodSpacing: 6, tagSpacing: 14, liveTag: .large,
                                                   name: .title3.weight(.bold), programme: .headline, episode: .headline,
                                                   title: .title3.weight(.bold), lines: nil, time: .callout.monospacedDigit(),
                                                   liveBarSpacing: 12, liveBarHeight: 8))
    static let phone = Metrics(compact: true, inset: 16, posterWidth: 110, resumeWidth: 220, cardSpacing: 12, rowPadding: 8, factsGap: 4, gridColumns: nil,
                               artTitle: 14, badge: 12, badgeSmall: 10,
                               heroHeight: 470, heroTitle: 32, detailTitle: 30, detailTop: 40, detailLogo: CGSize(width: 260, height: 90), stillWidth: 140, textWidth: .infinity,
                               stateIcon: 40, statePadding: 24, liveColumns: false,
                               pairingTitle: 28, showsQR: false, codeCell: 40, pairingColumn: nil,
                               panelPadding: 20, panelCard: 200, listWidth: 340, recentCard: 240,
                               dialogTitle: 26, dialogWidth: 460, nextCard: 340, dialogMargin: 24,
                               pickerWidth: nil, iconButton: 44, castPhoto: 72, subtitleSize: 17,
                               cardRadius: 10, wideRadius: 14,
                               playerText: PlayerText(liveSpacing: 4, vodSpacing: 2, tagSpacing: 10, liveTag: .small,
                                                      name: .headline, programme: .subheadline, episode: .subheadline,
                                                      title: .headline, lines: 1, time: .caption.monospacedDigit(),
                                                      liveBarSpacing: 6, liveBarHeight: 4))
    /// The tablet, window wide: the television's layouts at a size for 1 024 to 1 366 points of width, no room kept for a
    /// focus growth. Six posters across in landscape, five upright (`gridColumns` nil: as many as fit).
    static let pad = Metrics(compact: false, inset: 40, posterWidth: 170, resumeWidth: 300, cardSpacing: 20, rowPadding: 10, factsGap: 8, gridColumns: nil,
                             artTitle: 22, badge: 14, badgeSmall: 11,
                             heroHeight: 460, heroTitle: 48, detailTitle: 52, detailTop: 100, detailLogo: CGSize(width: 420, height: 140), stillWidth: 200, textWidth: 760,
                             stateIcon: 48, statePadding: 40, liveColumns: true,
                             pairingTitle: 40, showsQR: false, codeCell: 52, pairingColumn: 420,
                             panelPadding: 32, panelCard: 240, listWidth: 420, recentCard: 320,
                             dialogTitle: 34, dialogWidth: 640, nextCard: 460, dialogMargin: 40,
                             pickerWidth: nil, iconButton: 56, castPhoto: 100, subtitleSize: 30,
                             cardRadius: 12, wideRadius: 14,
                             playerText: PlayerText(liveSpacing: 6, vodSpacing: 4, tagSpacing: 12, liveTag: .large,
                                                    name: .title3.weight(.bold), programme: .headline, episode: .subheadline,
                                                    title: .title2.weight(.bold), lines: 1, time: .callout.monospacedDigit(),
                                                    liveBarSpacing: 8, liveBarHeight: 5))

    /// The device's own set, its window taken as wide: the environment's default and what the previews use.
    /// `adaptiveMetrics()` narrows the tablet to `phone` when its window is.
    static var current: Metrics {
        #if os(tvOS)
        return .tv
        #else
        return Platform.isPad ? .pad : .phone
        #endif
    }

    /// The set for the window's width class: the tablet in a narrow window lays out like the phone.
    static func resolve(sizeClass: UserInterfaceSizeClass?) -> Metrics {
        #if os(tvOS)
        return .tv
        #else
        return Platform.isPad && sizeClass != .compact ? .pad : .phone
        #endif
    }
}

extension EnvironmentValues {
    @Entry var metrics: Metrics = .current
}

/// Sets `metrics` from the window's width class: the root of the app and the player's cover, which has its own.
private struct AdaptiveMetrics: ViewModifier {
    @Environment(\.horizontalSizeClass) private var sizeClass

    func body(content: Content) -> some View {
        content.environment(\.metrics, Metrics.resolve(sizeClass: sizeClass))
    }
}

// MARK: - Modifiers hiding an API one platform lacks

/// On iOS `.card` does not exist: a plain button that shrinks a little while pressed, and lifts under a pointer.
private struct TouchCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .hoverEffect(.lift)
    }
}

extension View {
    /// The metrics of the window's width: the device's set, the tablet narrowed to the phone's in a narrow window.
    func adaptiveMetrics() -> some View {
        modifier(AdaptiveMetrics())
    }

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
    /// On iOS the player keeps the safe area (notch, home indicator): a little air on top of it, more on the tablet.
    @ViewBuilder func playerChromeInsets() -> some View {
        #if os(tvOS)
        padding(.horizontal, Metrics.tv.inset).padding(.vertical, 60).ignoresSafeArea()
        #else
        padding(.horizontal, Platform.isPad ? 28 : 12).padding(.vertical, Platform.isPad ? 20 : 8)
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

    /// iOS: the tabs adapt to the tablet (a bar at the top, a sidebar on demand); the phone keeps its bottom bar.
    /// tvOS keeps its own bar: the sidebar style would replace it.
    @ViewBuilder func adaptiveTabs() -> some View {
        #if os(iOS)
        tabViewStyle(.sidebarAdaptable)
        #else
        self
        #endif
    }

    /// The screen's title. Phone: in the navigation bar, large, shrinking into the bar as the content scrolls.
    /// Tablet, wide: the screen draws its own title like the television, the bar keeps none (the title still
    /// names the back button). tvOS has no navigation bar.
    func screenTitle(_ title: String) -> some View {
        modifier(ScreenTitle(title: title))
    }

    /// The search field. iPhone: always shown under the title; by default iOS hides it until the
    /// content is pulled down, and the empty screen has nothing to pull.
    @ViewBuilder func searchField(text: Binding<String>, prompt: String) -> some View {
        #if os(iOS)
        searchable(text: text, placement: .navigationBarDrawer(displayMode: .always), prompt: prompt)
        #else
        searchable(text: text, prompt: prompt)
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

    /// iPhone: a sideways swipe, alongside the scroll. `touching` while the finger is down, `swiped` with
    /// -1 (towards the right: back) or 1 (towards the left: next). tvOS has no touch: unchanged.
    @ViewBuilder func horizontalSwipe(touching: @escaping (Bool) -> Void, swiped: @escaping (Int) -> Void) -> some View {
        #if os(iOS)
        simultaneousGesture(DragGesture(minimumDistance: 24)
            .onChanged { _ in touching(true) }
            .onEnded { v in
                touching(false)
                let dx = v.translation.width
                if abs(dx) > 60, abs(dx) > abs(v.translation.height) { swiped(dx < 0 ? 1 : -1) }
            })
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

private struct ScreenTitle: ViewModifier {
    @Environment(\.metrics) private var metrics
    let title: String

    func body(content: Content) -> some View {
        #if os(iOS)
        if metrics.compact {
            content.navigationTitle(title).navigationBarTitleDisplayMode(.large)
        } else {
            content.navigationTitle(title).navigationBarTitleDisplayMode(.inline).toolbar(removing: .title)
        }
        #else
        content
        #endif
    }
}
