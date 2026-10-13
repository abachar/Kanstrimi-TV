import SwiftUI

/// A profile's picture in a circle: the server's image, its initial on a colour of its own meanwhile or without one.
struct AvatarView: View {
    let profile: Profile
    let size: CGFloat

    var body: some View {
        Circle().fill(Self.color(for: profile.id))
            .overlay {
                AsyncImage(url: profile.avatar) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { initial }
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
    }

    /// The server's own rule for a profile without a picture: hues spread around the wheel by id.
    static func color(for id: Int) -> Color { Color(hue: Double((id * 137) % 360) / 360, saturation: 0.45, brightness: 0.5) }

    private var initial: some View {
        Text(profile.initial).font(.system(size: size * 0.46, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
    }
}

/// An avatar as a button, like YouTube's « Qui regarde ? »: no platter, the circle itself grows under the focus and
/// takes a white ring (`AvatarCell`); the profile this device is on keeps the accent ring.
private struct AvatarButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Pressable(configuration: configuration) }

    private struct Pressable: View {
        let configuration: Configuration
        @Environment(\.isFocused) private var isFocused

        var body: some View {
            configuration.label
                .scaleEffect(isFocused ? 1.12 : configuration.isPressed ? 0.96 : 1)
                .animation(.easeOut(duration: 0.15), value: isFocused)
                .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
        }
    }
}

/// The household as a row of avatars, the one this device is on wearing the accent ring. Choosing one switches at once.
struct ProfileGrid: View {
    @Environment(\.metrics) private var metrics
    let profiles: [Profile]
    let current: Int?
    let onSelect: (Profile) -> Void

    private var size: CGFloat { Platform.isTV ? 220 : metrics.compact ? 100 : 150 }
    private var ring: CGFloat { Platform.isTV ? 6 : 3 }
    /// Up to this many, the row is centred without scrolling; past it, it scrolls.
    private var fits: Bool { profiles.count <= (Platform.isTV ? 6 : metrics.compact ? 3 : 5) }

    var body: some View {
        if fits {
            row.frame(maxWidth: .infinity)
        } else {
            ScrollView(.horizontal, showsIndicators: false) { row.padding(.horizontal, metrics.inset) }.scrollClipDisabled()
        }
    }

    private var row: some View {
        HStack(alignment: .top, spacing: Platform.isTV ? 72 : 28) {
            ForEach(profiles) { p in
                Button { onSelect(p) } label: {
                    VStack(spacing: Platform.isTV ? 24 : 12) {
                        AvatarCell(profile: p, size: size, ring: ring, current: p.id == current)
                        Text(p.name)
                            .font(Platform.isTV ? .callout : .footnote)
                            .foregroundStyle(p.id == current ? Theme.text : Theme.secondary)
                            .lineLimit(1)
                            .frame(width: size + 40)
                    }
                }
                .buttonStyle(AvatarButtonStyle())
                .accessibilityLabel(p.id == current ? "\(p.name), profil actuel" : p.name)
            }
        }
        .padding(.vertical, Platform.isTV ? 40 : 16)
    }
}

/// The circle with its ring: white while focused, accent for the current profile, none otherwise.
private struct AvatarCell: View {
    let profile: Profile
    let size: CGFloat
    let ring: CGFloat
    let current: Bool
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        AvatarView(profile: profile, size: size)
            .padding(ring * 1.5)
            .overlay {
                Circle().strokeBorder(isFocused ? Color.white : current ? Theme.accent : .clear, lineWidth: ring)
            }
            .shadow(color: .black.opacity(isFocused ? 0.5 : 0.25), radius: isFocused ? 24 : 10, y: 8)
    }
}

/// « Qui regarde ? »: the gate once paired while this device is on no profile the server knows, and the Profil screen
/// (a tab on tvOS and the tablet, pushed from the avatar on iPhone), the same picture with the current one ringed.
struct ProfilesScreen: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.metrics) private var metrics
    /// The gate rings no one: nothing is chosen yet. The screen rings the current profile.
    var gate = false

    var body: some View {
        VStack(spacing: Platform.isTV ? 64 : 32) {
            Spacer(minLength: 0)
            Text("Qui regarde ?").font(Platform.isTV ? .largeTitle : .title)
            ProfileGrid(profiles: env.profiles, current: gate ? nil : env.profile?.id) { env.select($0) }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, metrics.inset)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background.ignoresSafeArea())
        // Asked again each time the screen shows and after a long absence: a profile created in the admin meanwhile appears.
        .task { await env.loadProfiles() }
        .onChange(of: env.resumeRevision) { Task { await env.loadProfiles() } }
    }
}

struct ProfilePickerView: View {
    var body: some View { ProfilesScreen(gate: true) }
}

struct ProfileView: View {
    var body: some View {
        if Platform.isTV {
            ProfilesScreen()
        } else {
            ProfilesScreen().screenTitle("Profil")
        }
    }
}
