from flask import Flask, render_template

app = Flask(__name__)

# Route for your homepage, will serve your frontend HTML
@app.route('/')
def home():
    return render_template('index.html')  # Serve the index.html file from the templates folder

if __name__ == '__main__':
    app.run(debug=True)