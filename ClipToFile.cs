using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Collections.Specialized;
using System.Windows.Forms;
using System.Threading;
using System.Runtime.InteropServices;

namespace ClipToFileApp
{
    class Program
    {
        [DllImport("kernel32.dll")]
        static extern bool SetProcessWorkingSetSize(IntPtr proc, int min, int max);

        [STAThread]
        static void Main(string[] args)
        {
            int charCutoff = 2500;
            string targetDir = @"C:\Users\HomePC\Desktop\Coded\clipboard-ai-worker\clips";
            if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);

            // Trim working set to drop unused memory immediately
            SetProcessWorkingSetSize(System.Diagnostics.Process.GetCurrentProcess().Handle, -1, -1);

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==========================================================");
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine(" [*] ClipToFile Native Worker (Lightweight)");
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==========================================================");
            Console.ForegroundColor = ConsoleColor.Gray;
            Console.WriteLine(" Short copies (< {0} chars) stay as normal text.", charCutoff);
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine(" Huge copies (>= {0} chars) auto-convert to file for AI chats.", charCutoff);
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==========================================================");
            Console.ResetColor();

            string lastHash = "";
            UTF8Encoding utf8NoBom = new UTF8Encoding(false);

            while (true)
            {
                try
                {
                    if (Clipboard.ContainsText())
                    {
                        string text = Clipboard.GetText();
                        if (!string.IsNullOrEmpty(text))
                        {
                            string trimmed = text.Trim();
                            if (trimmed.Length >= charCutoff)
                            {
                                byte[] bytes = utf8NoBom.GetBytes(trimmed);
                                string hash;
                                using (MD5 md5 = MD5.Create())
                                {
                                    hash = BitConverter.ToString(md5.ComputeHash(bytes));
                                }

                                if (hash != lastHash)
                                {
                                    string ext = "txt";
                                    string prefix = "notes";

                                    if (trimmed.StartsWith("{") && trimmed.EndsWith("}")) { ext = "json"; prefix = "data"; }
                                    else if (trimmed.Contains("def ") || trimmed.Contains("import ")) { ext = "py"; prefix = "script"; }
                                    else if (trimmed.Contains("function ") || trimmed.Contains("const ")) { ext = "js"; prefix = "code"; }
                                    else if (trimmed.StartsWith("#")) { ext = "md"; prefix = "doc"; }

                                    string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                                    string fileName = prefix + "_" + timestamp + "." + ext;
                                    string filePath = Path.Combine(targetDir, fileName);

                                    File.WriteAllText(filePath, trimmed, utf8NoBom);

                                    StringCollection files = new StringCollection();
                                    files.Add(filePath);
                                    Clipboard.SetFileDropList(files);

                                    lastHash = hash;
                                    Console.ForegroundColor = ConsoleColor.Cyan;
                                    Console.WriteLine("[{0}] [+] Converted {1} chars to {2}", DateTime.Now.ToString("HH:mm:ss"), trimmed.Length, fileName);
                                    Console.ResetColor();
                                    Console.Beep(1200, 100);

                                    // Trim RAM back down after operation
                                    SetProcessWorkingSetSize(System.Diagnostics.Process.GetCurrentProcess().Handle, -1, -1);
                                }
                            }
                        }
                    }
                }
                catch { }

                Thread.Sleep(700);
            }
        }
    }
}
