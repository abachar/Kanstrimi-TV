import SwiftUI
import UIKit

/// The tab bar draws images and text only, never a view: the profile's picture is fetched once, clipped to a circle at
/// the bar's size and handed to it as an image (`AppEnvironment.tabAvatar`).
enum TabAvatar {
    /// The symbol's size in the bar: larger on the television, read from across the room.
    static var side: CGFloat { Platform.isTV ? 46 : 26 }

    static func render(_ data: Data?, profile: Profile) -> UIImage {
        let side = side
        let source = data.flatMap(UIImage.init(data:))
        // Always original: the tvOS tab bar tints any other image to one colour, a white or black disc.
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { ctx in
            let rect = CGRect(x: 0, y: 0, width: side, height: side)
            UIBezierPath(ovalIn: rect).addClip()
            if let source {
                // Square already (the server crops it); filled in case it is not.
                let scale = max(side / source.size.width, side / source.size.height)
                let w = source.size.width * scale, h = source.size.height * scale
                source.draw(in: CGRect(x: (side - w) / 2, y: (side - h) / 2, width: w, height: h))
            } else {
                UIColor(AvatarView.color(for: profile.id)).setFill()
                ctx.fill(rect)
                let text = profile.initial as NSString
                let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: side * 0.5, weight: .semibold),
                                                            .foregroundColor: UIColor.white]
                let size = text.size(withAttributes: attrs)
                text.draw(at: CGPoint(x: (side - size.width) / 2, y: (side - size.height) / 2), withAttributes: attrs)
            }
        }.withRenderingMode(.alwaysOriginal)
    }
}

extension AppEnvironment {
    /// The current profile's picture for the tab bar, its initial until it arrives or when it never does.
    func loadTabAvatar() async {
        guard let p = profile else { tabAvatar = nil; return }
        tabAvatar = TabAvatar.render(nil, profile: p)
        let data = try? await URLSession.shared.data(from: p.avatar).0
        guard profile?.id == p.id, let data, UIImage(data: data) != nil else { return }
        tabAvatar = TabAvatar.render(data, profile: p)
    }
}
