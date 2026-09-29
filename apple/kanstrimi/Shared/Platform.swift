import SwiftUI
#if os(macOS)
import AppKit

/// The native view type VLCKit draws into.
typealias PlatformView = NSView
#else
import UIKit

/// The native view type VLCKit draws into.
typealias PlatformView = UIView
#endif

/// A plain black surface for VLCKit: the player's drawable on tvOS and macOS, the live preview everywhere.
func makeBlackSurface() -> PlatformView {
    #if os(macOS)
    let v = NSView()
    v.wantsLayer = true
    v.layer?.backgroundColor = NSColor.black.cgColor
    #else
    let v = UIView()
    v.backgroundColor = .black
    #endif
    return v
}

/// What differs between the television, the phone and the Mac, in one place. Views stay free of
/// `#if os(...)`: they read `Metrics` for sizes and use the modifiers below for the APIs one
/// platform lacks.
nonisolated enum Platform {
    /// "Apple TV", "iPhone" or "Mac": the device the app runs on, for the messages that name it.
    /// iPad will need the runtime idiom; for now the platform is enough.
    static let deviceKind: String = {
        #if os(tvOS)
        "Apple TV"
        #elseif os(macOS)
        "Mac"
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

    static var isMac: Bool {
        #if os(macOS)
        true
        #else
        false
        #endif
    }
}

/// Sizes tuned for a screen seen from the sofa versus one held in the hand. One value per
/// platform today; a compact/regular variant will do for iPad. `nil` means "no fixed size":
/// the element takes the width it is given.
nonisolated struct Metrics: Sendable {
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

    static let tv = Metrics(inset: 96, posterWidth: 250, resumeWidth: 400, cardSpacing: 36, rowPadding: 30, gridColumns: 6,
                            artTitle: 30, badge: 17, badgeSmall: 13,
                            heroHeight: 640, heroTitle: 88, detailTitle: 76, detailTop: 160, stillWidth: 260, textWidth: 1000,
                            stateIcon: 56, statePadding: 60, searchPoster: 360, searchColumn: 400, liveColumns: true, channelLogo: 96,
                            pairingTitle: 56, showsQR: true, codeCell: 60, pairingColumn: 520,
                            panelHeight: 440, panelPadding: 48, panelCard: 300, listWidth: 620, recentCard: 360,
                            dialogTitle: 48, dialogWidth: 900, nextCard: 620, dialogMargin: 70,
                            pickerWidth: 1200, toggleWidth: 420)
    static let phone = Metrics(inset: 16, posterWidth: 110, resumeWidth: 220, cardSpacing: 12, rowPadding: 8, gridColumns: nil,
                               artTitle: 14, badge: 12, badgeSmall: 10,
                               heroHeight: 300, heroTitle: 32, detailTitle: 30, detailTop: 40, stillWidth: 140, textWidth: .infinity,
                               stateIcon: 40, statePadding: 24, searchPoster: 140, searchColumn: nil, liveColumns: false, channelLogo: 56,
                               pairingTitle: 28, showsQR: false, codeCell: 40, pairingColumn: nil,
                               panelHeight: 300, panelPadding: 20, panelCard: 200, listWidth: 340, recentCard: 240,
                               dialogTitle: 26, dialogWidth: 460, nextCard: 340, dialogMargin: 24,
                               pickerWidth: nil, toggleWidth: nil)
    static let mac = Metrics(inset: 32, posterWidth: 160, resumeWidth: 260, cardSpacing: 16, rowPadding: 16, gridColumns: nil,
                             artTitle: 16, badge: 14, badgeSmall: 12,
                             heroHeight: 400, heroTitle: 40, detailTitle: 40, detailTop: 60, stillWidth: 200, textWidth: 800,
                             stateIcon: 48, statePadding: 32, searchPoster: 200, searchColumn: nil, liveColumns: false, channelLogo: 64,
                             pairingTitle: 32, showsQR: false, codeCell: 48, pairingColumn: nil,
                             panelHeight: 360, panelPadding: 24, panelCard: 220, listWidth: 400, recentCard: 280,
                             dialogTitle: 32, dialogWidth: 500, nextCard: 400, dialogMargin: 32,
                             pickerWidth: nil, toggleWidth: nil)

    static var current: Metrics {
        #if os(tvOS)
        return .tv
        #elseif os(macOS)
        return .mac
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

    /// The filled button. The app tint is white: on iOS the label would be white too, so it is
    /// drawn dark there. tvOS already inverts the label of a focused or prominent button.
    @ViewBuilder func prominentButtonStyle() -> some View {
        #if os(tvOS)
        buttonStyle(.borderedProminent)
        #else
        buttonStyle(.borderedProminent).foregroundStyle(.black)
        #endif
    }

    /// The Back (Menu) button of the Siri Remote. iOS has no such command: its screens close
    /// with a button or a swipe, so this does nothing there.
    @ViewBuilder func onBackCommand(perform action: @escaping () -> Void) -> some View {
        #if os(tvOS) || os(macOS)
        onExitCommand(perform: action)
        #else
        self
        #endif
    }

    /// Margins of what floats over the video. The player lives in its own hosting controller on
    /// tvOS, which hands the safe area (80 pt) back to its content: the inset alone is the margin.
    /// On iOS the safe area is the notch and the home indicator: keep it, add a little air.
    @ViewBuilder func playerChromeInsets() -> some View {
        #if os(tvOS)
        padding(.horizontal, Metrics.tv.inset).padding(.vertical, 60).ignoresSafeArea()
        #elseif os(macOS)
        padding(.horizontal, Metrics.mac.inset).padding(.vertical, 32).ignoresSafeArea()
        #else
        padding(.horizontal, 24).padding(.vertical, 12)
        #endif
    }

    /// Any touch on a panel counts as activity for its inactivity timer. Focus moves do that on tvOS.
    @ViewBuilder func touchActivity(_ onActivity: @escaping () -> Void) -> some View {
        #if os(iOS)
        simultaneousGesture(TapGesture().onEnded { onActivity() })
            .simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { _ in onActivity() })
        #elseif os(macOS)
        onContinuousHover { _ in onActivity() }
        #else
        self
        #endif
    }

    /// A screen that takes the whole display (genre grid): a full-screen cover on tvOS and iOS,
    /// a sheet on macOS, which has no such cover.
    @ViewBuilder func platformCover<Item: Identifiable, Content: View>(item: Binding<Item?>, @ViewBuilder content: @escaping (Item) -> Content) -> some View {
        #if os(macOS)
        sheet(item: item, content: content)
        #else
        fullScreenCover(item: item, content: content)
        #endif
    }

    @ViewBuilder func platformCover<Content: View>(isPresented: Binding<Bool>, @ViewBuilder content: @escaping () -> Content) -> some View {
        #if os(macOS)
        sheet(isPresented: isPresented, content: content)
        #else
        fullScreenCover(isPresented: isPresented, content: content)
        #endif
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

    @ViewBuilder func playerPresentation<Content: View>(isPresented: Binding<Bool>, @ViewBuilder content: @escaping () -> Content) -> some View {
        #if os(macOS)
        self.overlay {
            if isPresented.wrappedValue {
                ZStack {
                    Theme.background.ignoresSafeArea()
                    content()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea()
            }
        }
        #else
        fullScreenCover(isPresented: isPresented, content: content)
        #endif
    }

    /// The main tabs: a sidebar on the Mac, the platform's tab bar elsewhere.
    @ViewBuilder func mainTabsStyle() -> some View {
        #if os(macOS)
        tabViewStyle(.sidebarAdaptable)
        #else
        self
        #endif
    }
}
