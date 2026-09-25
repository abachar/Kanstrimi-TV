import SwiftUI

/// Qualities in rows, languages in columns; a dot per existing version, "×2" for merged sources,
/// "AUTO" on the one `Lecture` plays [7].
struct VersionMatrix: View {
    let versions: [Version]
    let autoID: String?

    var body: some View {
        let langs = versions.languages
        let rows = versions.qualityRows
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Toutes les versions").font(.headline)
                Text("\(versions.sourceCount) flux · \(langs.count) langue\(langs.count > 1 ? "s" : "")").font(.caption).foregroundStyle(Theme.secondary)
            }
            Grid(horizontalSpacing: 14, verticalSpacing: 8) {
                GridRow {
                    Text("").frame(width: 150)
                    ForEach(langs, id: \.self) { l in
                        Text(l.rawValue).font(.caption.weight(.bold)).foregroundStyle(Theme.secondary).lineLimit(1).minimumScaleFactor(0.7).frame(width: 90)
                    }
                }
                ForEach(rows, id: \.key) { row in
                    GridRow {
                        Text(label(row)).font(.caption).lineLimit(1).minimumScaleFactor(0.7).frame(width: 150, alignment: .leading)
                        ForEach(langs, id: \.self) { l in
                            cell(versions.version(language: l, quality: row.quality, dynamicRange: row.dynamicRange))
                        }
                    }
                }
            }
            HStack(spacing: 18) {
                legend("×2", "sources fusionnées")
                legend("AUTO", "version lue par Lecture")
            }
            .padding(.top, 4)
        }
        .padding(22)
        .frame(maxWidth: 640, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
    }

    private func label(_ row: QualityRow) -> String {
        guard let dr = row.dynamicRange, dr != .sdr else { return row.quality.label }
        return "\(row.quality.label) \(dr.label)"
    }

    @ViewBuilder private func cell(_ v: Version?) -> some View {
        if let v {
            let auto = v.id == autoID
            Text(auto ? "AUTO" : (v.sources.count > 1 ? "×\(v.sources.count)" : "●"))
                .font(.caption.weight(.bold))
                .frame(width: 90, height: 30)
                .background(RoundedRectangle(cornerRadius: 8).fill(auto ? Theme.accent : .white.opacity(0.14)))
                .foregroundStyle(auto ? .black : Theme.text)
        } else {
            Text("—").font(.caption).foregroundStyle(Theme.secondary.opacity(0.5)).frame(width: 90, height: 30)
        }
    }

    private func legend(_ key: String, _ text: String) -> some View {
        HStack(spacing: 6) {
            Text(key).font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 5).fill(.white.opacity(0.14)))
            Text(text).font(.caption2).foregroundStyle(Theme.secondary)
        }
    }
}
