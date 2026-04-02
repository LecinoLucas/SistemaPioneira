import Foundation
import PDFKit
import Vision
import AppKit

func renderPage(_ page: PDFPage, scale: CGFloat) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    let width = Int((bounds.width * scale).rounded(.up))
    let height = Int((bounds.height * scale).rounded(.up))

    guard width > 0, height > 0 else { return nil }

    guard let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        return nil
    }

    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))

    context.saveGState()
    context.translateBy(x: 0, y: CGFloat(height))
    context.scaleBy(x: scale, y: -scale)
    page.draw(with: .mediaBox, to: context)
    context.restoreGState()

    return context.makeImage()
}

func recognizeText(in image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.015
    request.recognitionLanguages = ["pt-BR", "en-US"]

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])

    let observations = (request.results ?? []).sorted { lhs, rhs in
        if abs(lhs.boundingBox.maxY - rhs.boundingBox.maxY) > 0.02 {
            return lhs.boundingBox.maxY > rhs.boundingBox.maxY
        }
        return lhs.boundingBox.minX < rhs.boundingBox.minX
    }

    return observations
        .compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: "\n")
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    FileHandle.standardError.write(Data("Usage: pdf_ocr.swift <pdf-path> [max-pages]\n".utf8))
    exit(64)
}

let pdfPath = arguments[1]
let maxPages = max(1, min(Int(arguments.dropFirst(2).first ?? "3") ?? 3, 8))
let pdfURL = URL(fileURLWithPath: pdfPath)

guard let document = PDFDocument(url: pdfURL) else {
    FileHandle.standardError.write(Data("Failed to open PDF at \(pdfPath)\n".utf8))
    exit(66)
}

let pageCount = min(document.pageCount, maxPages)
var allPages: [String] = []

for pageIndex in 0..<pageCount {
    guard let page = document.page(at: pageIndex) else { continue }
    guard let image = renderPage(page, scale: 2.2) else { continue }

    do {
        let text = try recognizeText(in: image)
        if !text.isEmpty {
            allPages.append(text)
        }
    } catch {
        continue
    }
}

let output = allPages.joined(separator: "\n\n")
if output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
    exit(0)
}

FileHandle.standardOutput.write(Data(output.utf8))
