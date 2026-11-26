import AppKit
import WebKit

// 用 WebKit（跟 Safari 一樣的引擎）把 SVG 畫成 PNG，用來產生分享預覽圖 img/share.png。
// 用法：swift tools/render-svg.swift <svg 檔> <png 檔> <寬> <高>
// Retina 螢幕會輸出兩倍大的圖，之後用 sips -z <高> <寬> <png 檔> 縮回原本大小。
// （只有做圖時用得到，網站本身不需要這個檔案）
let args = CommandLine.arguments
let svgURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])
let w = Double(args[3])!, h = Double(args[4])!

class Loader: NSObject, WKNavigationDelegate {
  let view: WKWebView
  init(_ v: WKWebView) { view = v }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
      let config = WKSnapshotConfiguration()
      config.rect = CGRect(x: 0, y: 0, width: w, height: h)
      config.snapshotWidth = NSNumber(value: w) // 輸出就是 w 像素寬（不受螢幕倍率影響）
      webView.takeSnapshot(with: config) { image, error in
        guard let image = image, let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else {
          print("snapshot failed: \(String(describing: error))"); exit(1)
        }
        try! png.write(to: outURL)
        print("saved \(rep.pixelsWide)x\(rep.pixelsHigh)")
        exit(0)
      }
    }
  }
}

let app = NSApplication.shared
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h))
let loader = Loader(web)
web.navigationDelegate = loader
let svg = try! String(contentsOf: svgURL, encoding: .utf8)
let html = "<!doctype html><html><head><meta charset='utf-8'><style>html,body{margin:0;padding:0;overflow:hidden;background:#fff}svg{display:block}</style></head><body>\(svg)</body></html>"
web.loadHTMLString(html, baseURL: svgURL.deletingLastPathComponent())
app.run()
